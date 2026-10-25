export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, HEX64, isResponse, json, readJson, requireCompany } from '@/lib/gateway';
import { receiptPk, signPayReceipt } from '@/lib/payreceipt';
import { holds, reasonOf, severityOf, type AnyPayFlag } from '@/lib/satya/paycheck';
import { addPayCheck, listPayChecks, logAction, storeConfigured } from '@/lib/store';

const FLAGS = ['NEW_ACCOUNT', 'APPROVER_UNKNOWN', 'APPROVER_LIMIT', 'WRONG_CHANNEL', 'OVER_LIMIT', 'URGENT_SECRET', 'SYNTHETIC_VOICE', 'NO_ACCOUNT_FOUND', 'NETWORK_BLOCKED', 'NETWORK_REPORTED'] as const;

/** I7 history: every check, newest first. */
export async function GET(req: Request) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  return json({ items: await listPayChecks(u.org), receipt_pk: receiptPk() });
}

const Body = z.object({
  requester: z.string().min(1).max(60),
  channel: z.enum(['email', 'in_person', 'whatsapp', 'call', 'voice_note']),
  amount_inr: z.number().min(0).max(1e12).nullable(),
  request_hash: z.string().regex(HEX64),
  // A one-line description for the history ("Rs 4.8 lakh to a/c ••••6780"); never the request.
  summary: z.string().max(140),
  flags: z.array(z.enum(FLAGS)).max(FLAGS.length),
  voice_score: z.number().min(0).max(1).nullable(),
});

/**
 * I7 Pay Check result, from the company's browser (the request itself never leaves it). The gateway
 * re-derives the decision from the flags, so HOLD can't be skipped, and signs it.
 */
export async function POST(req: Request) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 8192);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const flags = [...new Set(p.data.flags)] as AnyPayFlag[];
  const decision = holds(flags) ? 'hold' : 'clear';
  const id = crypto.randomUUID();
  const receipt = await signPayReceipt(id, p.data.request_hash, decision);
  if (!receipt) return fail(500, 'not_configured');
  const rec = {
    id, created_at: receipt.decided_at, created_by: u.user,
    requester: p.data.requester, channel: p.data.channel, amount_inr: p.data.amount_inr, request_hash: p.data.request_hash, summary: p.data.summary,
    flags: flags.map((f) => ({ flag: f, severity: severityOf(f), reason: reasonOf(f) })),
    voice_score: p.data.voice_score, initial: decision, decision, receipt,
  } as const;
  await addPayCheck(u.org, { ...rec, flags: [...rec.flags] });
  await logAction(u.org, u.user, 'pay_checked', p.data.summary, `${decision.toUpperCase()}${flags.length ? ` · ${flags.join(', ')}` : ''}`);
  return json({ ...rec, receipt_pk: receiptPk() }, 201);
}
