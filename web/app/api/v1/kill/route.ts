export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireBank, requireConsole } from '@/lib/gateway';
import { addToBlocklist, getBlocklist, logAction, storeConfigured } from '@/lib/store';

const Body = z.object({
  indicators: z.array(z.object({
    t: z.enum(['upi', 'tel', 'host', 'app']),
    h: z.string().regex(/^[0-9a-f]{64}$/),
    // A masked label only, e.g. "UPI sbi.k***@ybl"; never the raw value.
    label: z.string().max(80).refine((s) => s.includes('*') || s.includes('…') || /^(Number|Site|App|UPI|A\/c)\b/.test(s), 'label must be masked'),
  })).min(1).max(20),
});

/**
 * One-Click Kill (I5): confirmed fake for every SATYA user. Phones get it with their next registry
 * sync; this bank's open reports that carry these values become "blocked".
 */
export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 16_384);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  try {
    const closed = await addToBlocklist(u.org, p.data.indicators);
    await logAction(u.org, u.user, 'blocked_for_everyone', p.data.indicators.map((i) => i.label).join(', '), `${closed} report(s) closed`);
    return json({ blocked_reports: closed });
  } catch {
    return fail(500, 'kill_failed');
  }
}

/** Blocklist view: every value confirmed fake, newest first (labels are masked; values never stored). */
export async function GET(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  return json({ items: await getBlocklist() });
}
