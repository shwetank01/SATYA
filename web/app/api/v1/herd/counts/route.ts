export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db, fail, isResponse, json, readJson, requireConsole } from '@/lib/gateway';

const Body = z.object({ hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(200) });

/** Radar: seen_7d / reports / confirmed_by for the campaign hashes a bank is looking at. */
export async function POST(req: Request) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const body = await readJson(req, 20_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const hashes = [...new Set(p.data.hashes)];
  if (!hashes.length) return json({});
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [ind, sig] = await Promise.all([
    db().from('indicators').select('hash,reports,confirmed_by').in('hash', hashes),
    db().from('sightings').select('hash').in('hash', hashes).gte('day', since).limit(20_000),
  ]);
  if (ind.error || sig.error) return fail(500, 'counts_failed');
  const seen = new Map<string, number>();
  for (const s of sig.data ?? []) seen.set((s as any).hash, (seen.get((s as any).hash) ?? 0) + 1);
  const out: Record<string, { seen_7d: number; reports: number; confirmed_by: string | null }> = {};
  for (const h of hashes) out[h] = { seen_7d: seen.get(h) ?? 0, reports: 0, confirmed_by: null };
  for (const i of ind.data ?? []) out[(i as any).hash] = { ...out[(i as any).hash], reports: (i as any).reports, confirmed_by: (i as any).confirmed_by };
  return json(out);
}
