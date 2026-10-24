export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db, fail, isResponse, json, requireConsole } from '@/lib/gateway';

/** Close a report; its sealed blob is purged 30 days later (VISMRITI cron). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const { id } = await ctx.params;
  const { data: r } = await db().from('reports').select('bank_id,status').eq('id', id).maybeSingle();
  if (!r) return fail(404, 'not_found');
  if (!u.orgs.includes(r.bank_id)) return fail(403, 'forbidden');
  const now = new Date().toISOString();
  if (r.status !== 'blocked') await db().from('reports').update({ status: 'dismissed', closed_at: now, updated_at: now }).eq('id', id);
  return json(null, 204);
}
