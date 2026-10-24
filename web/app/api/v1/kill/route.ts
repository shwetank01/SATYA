export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db, fail, isResponse, json, readJson, requireConsole } from '@/lib/gateway';

const Body = z.object({
  bank_id: z.string().regex(/^[A-Z0-9_]{2,16}$/),
  indicators: z.array(z.object({
    t: z.enum(['upi', 'tel', 'host', 'app']),
    h: z.string().regex(/^[0-9a-f]{64}$/),
    // A masked label only, e.g. "UPI sbi.k***@ybl"; never the raw value.
    label: z.string().max(80).refine((s) => s.includes('*') || s.includes('…') || /^(Number|Site|App|UPI|A\/c)\b/.test(s), 'label must be masked'),
  })).min(1).max(20),
});

/** One-Click Kill (I5): confirmed fake for every SATYA user; matching reports become "blocked". */
export async function POST(req: Request) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const body = await readJson(req, 16_384);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  if (!u.orgs.includes(p.data.bank_id)) return fail(403, 'forbidden');
  const { data, error } = await db().rpc('kill_indicators', {
    p_bank: p.data.bank_id,
    p_hashes: p.data.indicators.map((i) => i.h),
    p_types: p.data.indicators.map((i) => i.t),
    p_labels: p.data.indicators.map((i) => i.label),
  });
  if (error) return fail(500, 'kill_failed');
  return json({ blocked_reports: Number(data ?? 0) });
}
