export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { AVG_LOSS_INR, bankMetrics } from '@/lib/console/metrics';
import { fail, isResponse, json, requireBank } from '@/lib/gateway';
import { getBlocklist, herdEntries, listReports, storeConfigured } from '@/lib/store';

/** Fraud Overview: this bank's volumes, speed and the protection its blocks gave other phones. */
export async function GET(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const [rows, blocklist] = await Promise.all([listReports(u.org), getBlocklist()]);
  const mine = blocklist.filter((b) => b.by === u.org).slice(0, 100);
  const herd = await herdEntries(mine.map((b) => b.h));
  return json({ ...bankMetrics(u.org, rows, blocklist, herd), avg_loss_inr: AVG_LOSS_INR });
}
