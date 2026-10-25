export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, isResponse, json, requireBank, UUID } from '@/lib/gateway';
import { getReport, logAction, setStatus } from '@/lib/store';

/** The bank opened the sealed report in its browser (status -> opened, never backwards). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const r = await getReport(id);
  if (!r) return fail(404, 'not_found');
  if (r.bank_id !== u.org) return fail(403, 'forbidden');
  if (r.status === 'delivered') await logAction(u.org, u.user, 'report_opened', id);
  await setStatus(id, 'opened');
  return json(null, 204);
}
