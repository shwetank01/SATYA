export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { analyze } from '@/lib/ai/analyze';
import { CHAT_MODEL, sarvamConfigured } from '@/lib/ai/sarvam';
import { PROMISES, RULE_BOOK } from '@/lib/bundle';
import { fail, isResponse, json, readJson, requireBank } from '@/lib/gateway';
import { evaluate } from '@/lib/satya/rules';

const Body = z.object({
  text: z.string().min(1).max(4000),
  channel: z.enum(['sms', 'call', 'whatsapp', 'email', 'screen', 'voice']).default('sms'),
  sender: z.string().max(80).default(''),
});

const RANK = { none: 0, medium: 1, high: 2, critical: 3 } as const;

/**
 * NYAYA Scam Check: the same promise rules the phone runs (from the signed bundle), then Sarvam's
 * reading of the message. Rules decide "Breaks promise"; the AI can only add "Looks like a scam".
 */
export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  const body = await readJson(req, 24_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const { text, channel, sender } = p.data;
  const r = evaluate(RULE_BOOK, { text, channel, sender });
  const hits = r.hits
    .map(([id, severity]) => ({ id, severity, promise: PROMISES[id]?.promise ?? id, promise_hi: PROMISES[id]?.promise_hi ?? null, issuer: PROMISES[id]?.issuer ?? 'GLOBAL', source: PROMISES[id]?.source ?? null }))
    .sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const ai = sarvamConfigured() ? await analyze(text, { bank: r.bank, channel, sender }, CHAT_MODEL) : null;
  // Section 22.3: the same 0.75 bar the phone uses, so the console never disagrees with a receipt.
  const verdict = hits.length ? 'breaks' : ai?.source === 'ai' && ai.risk === 'scam' && ai.confidence >= 0.75 ? 'suspicious' : 'no_broken_promise';
  return json({ bank: r.bank, hits, verdict, ai });
}
