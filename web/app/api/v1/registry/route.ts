export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { BUNDLE } from '@/lib/bundle';
import { json, requireApp } from '@/lib/gateway';
import { getBlocklist, storeConfigured } from '@/lib/store';

/**
 * VACHAN (Section 8.7): the root-signed GLOBAL card, each bank's certificate and card, and the live
 * blocklist. The phone verifies every signature itself, so the blocklist rides along unsigned.
 */
export async function GET(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const blocklist = storeConfigured() ? await getBlocklist().catch(() => []) : [];
  return json({ ...BUNDLE, generated_at: new Date().toISOString(), blocklist: blocklist.map(({ h, t, by, label }) => ({ h, t, by, label })) });
}
