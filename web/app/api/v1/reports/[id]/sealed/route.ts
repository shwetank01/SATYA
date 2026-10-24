export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, isResponse, json, requireConsole, UUID } from '@/lib/gateway';
import { getReport } from '@/lib/store';

/** The sealed box for the bank's browser to open with its Box key. Never served to anyone else. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const r = await getReport(id);
  if (!r) return fail(404, 'not_found');
  if (r.bank_id !== u.org) return fail(403, 'forbidden');
  const { ticket_hash: _t, ...rest } = r;
  return json(rest);
}
