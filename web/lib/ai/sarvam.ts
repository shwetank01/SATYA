// Sarvam AI client (https://docs.sarvam.ai). Server only: the key lives in SARVAM_API_KEY on Vercel
// and in the gitignored web/.env.local, never in the app, the browser or the repository.
// Imported only by route handlers (app/api), so it never reaches a client bundle.

const BASE = (process.env.SARVAM_BASE_URL ?? 'https://api.sarvam.ai').replace(/\/+$/, '');
export const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL ?? 'sarvam-105b';
export const STT_MODEL = process.env.SARVAM_STT_MODEL ?? 'saaras:v3';

export class SarvamError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new SarvamError('sarvam_not_configured', 503);
  return k;
}

export const sarvamConfigured = () => Boolean(process.env.SARVAM_API_KEY);

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * One JSON-mode chat completion. Reasoning is switched off (`reasoning_effort: null`): with it on,
 * sarvam-105b spends the token budget thinking and returns no content for short labelling tasks.
 */
export async function chatJson<T>(messages: ChatMessage[], opts: { maxTokens?: number; timeoutMs?: number; temperature?: number } = {}): Promise<T> {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'api-subscription-key': key(), 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 500,
      reasoning_effort: null,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
  }).catch((e) => { throw new SarvamError(e?.name === 'TimeoutError' ? 'sarvam_timeout' : 'sarvam_unreachable', 504); });
  if (r.status === 429) throw new SarvamError('sarvam_rate_limited', 429);
  if (!r.ok) throw new SarvamError(`sarvam_http_${r.status}`);
  const body = await r.json().catch(() => null);
  const content: string | null | undefined = body?.choices?.[0]?.message?.content;
  if (!content) throw new SarvamError('sarvam_empty');
  return parseJsonLoose<T>(content);
}

/** Models sometimes wrap JSON in a code fence or add a sentence; take the outermost object. */
export function parseJsonLoose<T>(s: string): T {
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new SarvamError('sarvam_not_json');
  try { return JSON.parse(s.slice(a, b + 1)) as T; } catch { throw new SarvamError('sarvam_not_json'); }
}

export interface Transcript { transcript: string; language: string | null }

/** Speech-to-text (Saaras). The REST endpoint is meant for clips under 30 s. */
export async function transcribe(audio: Uint8Array, mime: string, opts: { timeoutMs?: number } = {}): Promise<Transcript> {
  const form = new FormData();
  const ext = mime.includes('ogg') || mime.includes('opus') ? 'ogg' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
    : mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'm4a' : mime.includes('webm') ? 'webm' : 'wav';
  form.append('file', new Blob([audio as BlobPart], { type: mime || 'application/octet-stream' }), `note.${ext}`);
  form.append('model', STT_MODEL);
  form.append('language_code', 'unknown');
  const r = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': key() },
    body: form,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
  }).catch((e) => { throw new SarvamError(e?.name === 'TimeoutError' ? 'sarvam_timeout' : 'sarvam_unreachable', 504); });
  if (r.status === 429) throw new SarvamError('sarvam_rate_limited', 429);
  if (!r.ok) throw new SarvamError(`sarvam_stt_http_${r.status}`);
  const j = await r.json().catch(() => null);
  return { transcript: String(j?.transcript ?? '').trim(), language: j?.language_code ?? null };
}
