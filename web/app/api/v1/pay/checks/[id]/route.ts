export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireCompany, UUID } from '@/lib/gateway';
import { receiptPk, signPayReceipt } from '@/lib/payreceipt';
import { getPayRules, listPayChecks, logAction, storeConfigured, updatePayCheck, type PayCheckRecord } from '@/lib/store';

/** One check, with the approver's saved callback number for Verify Before Release. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const [checks, rules] = await Promise.all([listPayChecks(u.org), getPayRules(u.org)]);
  const rec = checks.find((c) => c.id === id);
  if (!rec) return fail(404, 'not_found');
  const approver = rules.approvers.find((a) => a.name === rec.requester) ?? null;
  return json({ ...rec, approver, receipt_pk: receiptPk() });
}

const Body = z.object({ result: z.enum(['confirmed', 'denied']) });

/**
 * I8 Verify Before Release: a held payment moves only after someone calls the approver on the
 * number saved in Pay Rules (never a number in the request) and records the answer. Signed again.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const body = await readJson(req, 512);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const [checks, rules] = await Promise.all([listPayChecks(u.org), getPayRules(u.org)]);
  const cur = checks.find((c) => c.id === id);
  if (!cur) return fail(404, 'not_found');
  if (cur.decision !== 'hold') return fail(409, 'not_on_hold');
  const decision = p.data.result === 'confirmed' ? 'released' : 'blocked';
  const receipt = await signPayReceipt(id, cur.request_hash, decision);
  if (!receipt) return fail(500, 'not_configured');
  const phone = rules.approvers.find((a) => a.name === cur.requester)?.callback_phone ?? null;
  const next = await updatePayCheck(u.org, id, (r): PayCheckRecord | null => (r.decision !== 'hold' ? null : {
    ...r, decision, receipt, verify: { result: p.data.result, by: u.user, at: receipt.decided_at, callback_phone: phone },
  }));
  if (!next) return fail(409, 'not_on_hold');
  await logAction(u.org, u.user, 'pay_verified', cur.summary, `callback ${p.data.result}${phone ? ` on ${phone}` : ''}: ${decision}`);
  return json({ ...next, receipt_pk: receiptPk() });
}
