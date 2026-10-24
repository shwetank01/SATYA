/**
 * satya-ai: SATYA's own AI endpoint on Cloudflare Workers AI (free tier).
 *
 * OpenAI-compatible, so VIVEK's client works unchanged and any other provider (Groq, OpenAI, a
 * self-hosted vLLM) is a URL + key swap:
 *   GET  /v1/models
 *   POST /v1/chat/completions        -> open-weights Qwen chat model (falls back down CHAT_MODELS)
 *   POST /v1/audio/transcriptions    -> Whisper large v3 turbo
 *   GET  /health                     (no auth, no model call)
 *
 * Privacy (VISMRITI, Section 8.10): bodies are processed in memory and never logged or stored.
 * Callers send text that KAVACH already masked on the phone and VIVEK masked again.
 */

export interface Env {
  AI: Ai;
  /** Bearer key shared with VIVEK (secret). */
  AI_API_KEY: string;
  /** Comma-separated chat models, first is preferred. */
  CHAT_MODELS: string;
  STT_MODEL: string;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const err = (status: number, code: string, message?: string) =>
  json({ error: { code, message: message ?? code, type: 'satya_ai_error' } }, status);

/** Constant-time compare so the key can't be guessed byte by byte from timing. */
function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function authorised(req: Request, env: Env): boolean {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return sameKey(token, env.AI_API_KEY ?? '');
}

const chatModels = (env: Env) => (env.CHAT_MODELS || '@cf/qwen/qwen3-30b-a3b-fp8').split(',').map((s) => s.trim()).filter(Boolean);

/** Qwen3 reasons in <think> blocks; callers want only the answer. */
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
}

/** First balanced JSON object in a string, for callers that asked for json_object. */
export function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      const candidate = s.slice(start, i + 1);
      try { JSON.parse(candidate); return candidate; } catch { return null; }
    }
  }
  return null;
}

/** Workers AI returns either {response} (classic models) or OpenAI-style {choices} (newer models). */
export function contentOf(out: any): string {
  if (out == null) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  if (out.response && typeof out.response === 'object') return JSON.stringify(out.response);
  const c = out.choices?.[0]?.message?.content ?? out.choices?.[0]?.text;
  return typeof c === 'string' ? c : '';
}

async function chat(req: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await req.json(); } catch { return err(400, 'invalid_json'); }
  const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length || messages.some((m) => typeof m?.content !== 'string' || !['system', 'user', 'assistant'].includes(m?.role))) {
    return err(400, 'invalid_messages');
  }
  if (messages.reduce((n, m) => n + m.content.length, 0) > 16_000) return err(413, 'too_large');
  const wantJson = body?.response_format?.type === 'json_object';
  const maxTokens = Math.min(Math.max(Number(body?.max_tokens) || 256, 16), 1024);
  const temperature = Math.min(Math.max(Number(body?.temperature ?? 0), 0), 1.5);

  const requested = typeof body?.model === 'string' && body.model ? [body.model] : [];
  const order = [...new Set([...requested.filter((m) => chatModels(env).includes(m)), ...chatModels(env)])];
  let lastError = '';
  for (const model of order) {
    const msgs = messages.map((m) => ({ ...m }));
    if (model.includes('qwen3')) {
      // Qwen3: switch off the thinking pass for short labelling answers.
      const last = msgs.length - 1;
      if (msgs[last].role === 'user') msgs[last].content = msgs[last].content + ' /no_think';
    }
    if (wantJson && msgs[0]?.role === 'system') msgs[0].content += '\nReturn only one JSON object.';
    try {
      const out = await env.AI.run(model as any, { messages: msgs, max_tokens: maxTokens, temperature } as any);
      let content = stripThinking(contentOf(out));
      if (wantJson) {
        const j = firstJsonObject(content);
        if (!j) { lastError = 'model_returned_non_json'; continue; }
        content = j;
      }
      return json({
        id: 'satya-' + crypto.randomUUID(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: (out as any)?.usage ?? null,
      });
    } catch (e: any) {
      lastError = String(e?.message ?? e).slice(0, 200);
    }
  }
  return err(502, 'all_models_failed', lastError);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function transcribe(req: Request, env: Env): Promise<Response> {
  const ct = req.headers.get('content-type') ?? '';
  let audio: Uint8Array | null = null;
  let language: string | undefined;
  if (ct.includes('multipart/form-data')) {
    let form: FormData;
    try { form = await req.formData(); } catch { return err(400, 'invalid_form'); }
    const file = form.get('file');
    if (!file || typeof file === 'string') return err(400, 'file_required');
    audio = new Uint8Array(await (file as File).arrayBuffer());
    const lang = form.get('language');
    if (typeof lang === 'string' && /^[a-z]{2}$/.test(lang)) language = lang;
  } else {
    audio = new Uint8Array(await req.arrayBuffer());
  }
  if (!audio.length) return err(400, 'empty_audio');
  if (audio.length > 15 * 1024 * 1024) return err(413, 'too_large');
  const model = env.STT_MODEL || '@cf/openai/whisper-large-v3-turbo';
  try {
    const input: any = model.includes('large-v3-turbo') ? { audio: toBase64(audio), ...(language ? { language } : {}) } : { audio: [...audio] };
    const out: any = await env.AI.run(model as any, input);
    return json({ text: (out?.text ?? '').trim(), language: out?.transcription_info?.language ?? language ?? null, model });
  } catch (e: any) {
    return err(502, 'stt_failed', String(e?.message ?? e).slice(0, 200));
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && (path === '/health' || path === '/')) {
      return json({ ok: true, service: 'satya-ai', chat_models: chatModels(env), stt_model: env.STT_MODEL, key_configured: Boolean(env.AI_API_KEY) });
    }
    if (!authorised(req, env)) return err(401, 'unauthorized');
    if (req.method === 'GET' && path === '/v1/models') {
      const now = Math.floor(Date.now() / 1000);
      return json({ object: 'list', data: [...chatModels(env), env.STT_MODEL].filter(Boolean).map((id) => ({ id, object: 'model', created: now, owned_by: 'cloudflare-workers-ai' })) });
    }
    if (req.method === 'POST' && path === '/v1/chat/completions') return chat(req, env);
    if (req.method === 'POST' && path === '/v1/audio/transcriptions') return transcribe(req, env);
    return err(404, 'not_found');
  },
} satisfies ExportedHandler<Env>;
