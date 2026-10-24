export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db, fail, json, requireApp } from '@/lib/gateway';

/** SANGH (Section 8.8): every match for a 5-hex prefix; the phone picks its own hash (k-anonymity). */
export async function GET(req: Request, ctx: { params: Promise<{ prefix: string }> }) {
  const denied = requireApp(req);
  if (denied) return denied;
  const { prefix } = await ctx.params;
  if (!/^[0-9a-f]{5}$/.test(prefix)) return fail(400, 'bad_prefix');
  const { data, error } = await db().rpc('herd_lookup', { p_prefix: prefix });
  if (error) return fail(500, 'lookup_failed');
  return json({
    matches: (data ?? []).map((m: any) => ({ h: m.hash, t: m.type, seen_7d: Number(m.seen_7d ?? 0), reports: m.reports ?? 0, confirmed_by: m.confirmed_by, label: m.label })),
  });
}
