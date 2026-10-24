export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { analyze } from '@/lib/ai/analyze';
import { CHAT_MODEL, sarvamConfigured } from '@/lib/ai/sarvam';
import { fail, isResponse, json, readJson, requireAppOrConsole } from '@/lib/gateway';

const Body = z.object({
  text: z.string().min(1).max(4000),
  hint_bank: z.string().max(16).nullish(),
  channel: z.string().max(16).nullish(),
  sender: z.string().max(80).nullish(),
});

/**
 * PRAHARI's cloud opinion on one masked message (replaces VIVEK /v1/ask on the phone). Same
 * ask_type / claimed_bank / confidence fields, plus a plain-words explanation in English and Hindi.
 * Nothing is stored; the text is masked again before it leaves for Sarvam.
 */
export async function POST(req: Request) {
  const denied = requireAppOrConsole(req);
  if (denied) return denied;
  if (!sarvamConfigured()) return fail(503, 'ai_not_configured');
  const body = await readJson(req, 24_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const t = Date.now();
  const a = await analyze(p.data.text, { bank: p.data.hint_bank, channel: p.data.channel, sender: p.data.sender }, CHAT_MODEL);
  return json({ ...a, ms: Date.now() - t });
}
