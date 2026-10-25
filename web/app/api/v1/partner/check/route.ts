export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { dailyCap, orgOfKey } from '@/lib/apikeys';
import { fail, isResponse, json, readJson } from '@/lib/gateway';
import { scamCheck } from '@/lib/scamcheck';
import { countCall, dayOf, storeConfigured, usageOf } from '@/lib/store';

const Body = z.object({
  text: z.string().min(1).max(4000),
  channel: z.enum(['sms', 'call', 'whatsapp', 'email', 'screen', 'voice']).default('sms'),
  sender: z.string().max(80).default(''),
  /** false = promise rules only: no AI call, a few milliseconds. */
  ai: z.boolean().default(true),
});

const VERDICT = { breaks: 'Breaks promise', suspicious: 'Looks like a scam', no_broken_promise: 'No broken promise' } as const;

/**
 * Scam Check API for a bank's own channels: its mobile app, IVR, chatbot or contact-centre tools.
 * Same rules and AI as the console. Authorization: Bearer nyaya_live_<bank>_<secret>. Nothing in
 * the request is stored; each call is counted against the bank's daily cap.
 */
export async function POST(req: Request) {
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const who = await orgOfKey(req.headers.get('authorization'));
  if (!who) return fail(401, 'invalid_api_key');
  const cap = dailyCap();
  const day = dayOf();
  const used = (await usageOf(who.org, [day.slice(0, 7)]))[day] ?? 0;
  if (used >= cap) return json({ error: 'daily_cap_reached', cap }, 429, { 'retry-after': '3600', 'x-ratelimit-limit': String(cap), 'x-ratelimit-remaining': '0' });
  const body = await readJson(req, 24_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const t = Date.now();
  const r = await scamCheck(p.data.text, p.data.channel, p.data.sender, { ai: p.data.ai });
  const today = await countCall(who.org, day).catch(() => used + 1);
  return json({
    request_id: crypto.randomUUID(),
    verdict: r.verdict,
    verdict_text: VERDICT[r.verdict],
    claimed_bank: r.bank,
    broken_promises: r.hits.map(({ id, severity, promise, promise_hi, source }) => ({ id, severity, promise, promise_hi, source })),
    ai: r.ai && r.ai.source === 'ai' ? { risk: r.ai.risk, confidence: r.ai.confidence, summary: r.ai.summary, summary_hi: r.ai.summary_hi, advice: r.ai.advice, advice_hi: r.ai.advice_hi } : null,
    ms: Date.now() - t,
  }, 200, { 'x-ratelimit-limit': String(cap), 'x-ratelimit-remaining': String(Math.max(0, cap - today)) });
}
