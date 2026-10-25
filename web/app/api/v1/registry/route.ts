export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { BUNDLE } from '@/lib/bundle';
import { json, requireApp } from '@/lib/gateway';
import { effectiveBanks } from '@/lib/registry';
import { getBlocklist, storeConfigured } from '@/lib/store';

/**
 * VACHAN (Section 8.7): the root-signed GLOBAL card, each bank's certificate and card (the one the
 * bank signed and published from NYAYA, when there is one) and the live blocklist. The phone
 * verifies every signature itself, so the blocklist rides along unsigned.
 */
export async function GET(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const [banks, blocklist] = storeConfigured()
    ? await Promise.all([effectiveBanks().catch(() => BUNDLE.banks), getBlocklist().catch(() => [])])
    : [BUNDLE.banks, []];
  return json({ ...BUNDLE, banks, generated_at: new Date().toISOString(), blocklist: blocklist.map(({ h, t, by, label }) => ({ h, t, by, label })) });
}
