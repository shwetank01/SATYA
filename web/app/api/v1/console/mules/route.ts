export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireBank } from '@/lib/gateway';
import { getBlocklist, getMuleActions, herdEntries, logAction, seen7d, setMuleAction, storeConfigured } from '@/lib/store';

/**
 * Mule Watch: values confirmed fake by ANY bank whose account lives at THIS bank (from the UPI
 * handle or the IFSC). Those are accounts in this bank's own books receiving scam money.
 */
export async function GET(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const [blocklist, actions] = await Promise.all([getBlocklist(), getMuleActions(u.org)]);
  const mine = blocklist.filter((b) => b.home === u.org).slice(0, 200);
  const herd = await herdEntries(mine.map((b) => b.h));
  return json({
    items: mine.map((b) => {
      const e = herd.get(b.h);
      return { h: b.h, t: b.t, label: b.label, by: b.by, at: b.at, demo: b.demo ?? false, reports: e?.reports ?? 0, seen_7d: e ? seen7d(e) : 0, action: actions[b.h] ?? null };
    }),
  });
}

const Body = z.object({ h: z.string().regex(/^[0-9a-f]{64}$/), action: z.enum(['frozen', 'investigating', 'not_ours']) });

const WORD = { frozen: 'account frozen', investigating: 'under investigation', not_ours: 'not our account' } as const;

/** Records what the bank did about one mule alert. */
export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const row = (await getBlocklist()).find((b) => b.h === p.data.h && b.home === u.org);
  if (!row) return fail(404, 'not_a_mule_alert_for_this_bank');
  await setMuleAction(u.org, p.data.h, p.data.action, u.user);
  await logAction(u.org, u.user, 'mule_actioned', row.label, `${WORD[p.data.action]} (confirmed fake by ${row.by})`);
  return json(null, 204);
}
