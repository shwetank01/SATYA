import { describe, expect, it } from 'vitest';
import worker, { contentOf, firstJsonObject, stripThinking } from '../src/index';

const fakeAI = (impl: (model: string, input: any) => any) => ({ run: async (m: string, i: any) => impl(m, i) }) as any;
const env = (ai: any) => ({ AI: ai, AI_API_KEY: 'secret-key-123', CHAT_MODELS: '@cf/qwen/qwen3-30b-a3b-fp8,@cf/meta/llama-3.3-70b-instruct-fp8-fast', STT_MODEL: '@cf/openai/whisper-large-v3-turbo' });
const post = (path: string, body: unknown, key = 'secret-key-123') =>
  new Request('https://ai.dev' + path, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('helpers', () => {
  it('strips Qwen thinking', () => expect(stripThinking('<think>hmm</think>\n{"a":1}')).toBe('{"a":1}'));
  it('finds the first JSON object', () => expect(firstJsonObject('sure: {"ask_type":"share_secret","x":"}"} done')).toBe('{"ask_type":"share_secret","x":"}"}'));
  it('reads both Workers AI shapes', () => {
    expect(contentOf({ response: 'hi' })).toBe('hi');
    expect(contentOf({ choices: [{ message: { content: 'yo' } }] })).toBe('yo');
  });
});

describe('satya-ai', () => {
  it('rejects a wrong key', async () => {
    const r = await worker.fetch(post('/v1/chat/completions', {}, 'nope'), env(fakeAI(() => ({}))));
    expect(r.status).toBe(401);
  });
  it('answers chat in OpenAI shape, JSON-cleaned, with /no_think for Qwen3', async () => {
    let seenModel = ''; let lastUser = '';
    const ai = fakeAI((m, i) => { seenModel = m; lastUser = i.messages.at(-1).content; return { response: '<think>x</think> Here: {"ask_type":"share_secret","claimed_bank":"HDFC","urgency":"high","confidence":0.9}' }; });
    const r = await worker.fetch(post('/v1/chat/completions', { messages: [{ role: 'system', content: 'label' }, { role: 'user', content: 'OTP batao' }], response_format: { type: 'json_object' } }), env(ai));
    const j: any = await r.json();
    expect(r.status).toBe(200);
    expect(seenModel).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
    expect(lastUser.endsWith('/no_think')).toBe(true);
    expect(JSON.parse(j.choices[0].message.content).ask_type).toBe('share_secret');
  });
  it('falls back to the next model when the first fails', async () => {
    const ai = fakeAI((m) => { if (m.includes('qwen3')) throw new Error('capacity'); return { response: '{"ask_type":"other"}' }; });
    const r = await worker.fetch(post('/v1/chat/completions', { messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'json_object' } }), env(ai));
    const j: any = await r.json();
    expect(j.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });
  it('lists models', async () => {
    const r = await worker.fetch(new Request('https://ai.dev/v1/models', { headers: { authorization: 'Bearer secret-key-123' } }), env(fakeAI(() => ({}))));
    const j: any = await r.json();
    expect(j.data.map((d: any) => d.id)).toContain('@cf/openai/whisper-large-v3-turbo');
  });
  it('transcribes multipart audio with base64 input for whisper turbo', async () => {
    let input: any;
    const ai = fakeAI((_m, i) => { input = i; return { text: ' OTP batao ', transcription_info: { language: 'hi' } }; });
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }), 'audio.wav');
    const r = await worker.fetch(new Request('https://ai.dev/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer secret-key-123' }, body: fd }), env(ai));
    const j: any = await r.json();
    expect(j.text).toBe('OTP batao');
    expect(typeof input.audio).toBe('string');
  });
});
