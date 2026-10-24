export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, isResponse, json, requireConsole, UUID } from '@/lib/gateway';
import { getReport, setStatus } from '@/lib/store';

/** Close a report without blocking anything. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const r = await getReport(id);
  if (!r) return fail(404, 'not_found');
  if (r.bank_id !== u.org) return fail(403, 'forbidden');
  await setStatus(id, 'dismissed');
  return json(null, 204);
}
