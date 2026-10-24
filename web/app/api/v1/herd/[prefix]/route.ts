export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, json, requireApp } from '@/lib/gateway';
import { herdLookup, storeConfigured } from '@/lib/store';

/** SANGH (Section 8.8): every match for a 5-hex prefix; the phone picks its own hash (k-anonymity). */
export async function GET(req: Request, ctx: { params: Promise<{ prefix: string }> }) {
  const denied = requireApp(req);
  if (denied) return denied;
  const { prefix } = await ctx.params;
  if (!/^[0-9a-f]{5}$/.test(prefix)) return fail(400, 'bad_prefix');
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  try {
    return json({ matches: await herdLookup(prefix) });
  } catch {
    return fail(500, 'lookup_failed');
  }
}
