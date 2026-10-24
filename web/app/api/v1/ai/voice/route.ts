export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { analyze } from '@/lib/ai/analyze';
import { CHAT_MODEL, SarvamError, STT_MODEL, sarvamConfigured, transcribe } from '@/lib/ai/sarvam';
import { fail, json, requireAppOrConsole } from '@/lib/gateway';

const MAX = 4 * 1024 * 1024; // Vercel's request body limit is 4.5 MB.

/**
 * U5 voice notes: raw audio in, Sarvam Saaras transcript + the same analysis as /ai/analyze out.
 * The audio is held in memory for this request only. There is no deepfake score here: Sarvam has
 * no synthetic-voice model, so `synthetic_score` is null and the phone says so.
 */
export async function POST(req: Request) {
  const denied = requireAppOrConsole(req);
  if (denied) return denied;
  if (!sarvamConfigured()) return fail(503, 'ai_not_configured');
  if (Number(req.headers.get('content-length') ?? 0) > MAX) return fail(413, 'too_large');
  const audio = new Uint8Array(await req.arrayBuffer());
  if (!audio.length) return fail(400, 'empty');
  if (audio.length > MAX) return fail(413, 'too_large');
  try {
    const t = Date.now();
    const s = await transcribe(audio, req.headers.get('content-type') ?? 'audio/wav');
    const a = s.transcript ? await analyze(s.transcript, { channel: 'voice' }, CHAT_MODEL) : null;
    return json({ transcript: s.transcript, language: s.language, stt_model: STT_MODEL, synthetic_score: null, analysis: a, ms: Date.now() - t });
  } catch (e) {
    return fail(e instanceof SarvamError ? e.status : 502, e instanceof SarvamError ? e.message : 'stt_failed');
  }
}
