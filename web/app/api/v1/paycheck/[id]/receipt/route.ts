export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db, fail, isResponse, json, requireConsole } from '@/lib/gateway';
import { payReceiptMessage, signHex } from '@/lib/satya/crypto';

/** Evidence PDF signature (I9): SATYA signs check id + request hash + final decision + time. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  const { data: pc } = await db().from('pay_checks').select('id,org_id,request_hash,decision,decided_at,created_at').eq('id', id).maybeSingle();
  if (!pc) return fail(404, 'not_found');
  if (!u.orgs.includes(pc.org_id)) return fail(403, 'forbidden');
  if (pc.decision === 'hold') return fail(409, 'not_decided');
  const decidedAt = pc.decided_at ?? pc.created_at;
  const message = payReceiptMessage(pc.id, pc.request_hash, pc.decision, new Date(decidedAt).toISOString());
  const sk = process.env.SATYA_RECEIPT_SK;
  if (!sk) return fail(500, 'not_configured');
  return json({ sig: await signHex(message, sk), receipt_pk: process.env.SATYA_RECEIPT_PK, message });
}
