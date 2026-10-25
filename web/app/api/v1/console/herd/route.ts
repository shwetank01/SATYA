export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireConsole } from '@/lib/gateway';
import { herdLookupMany, storeConfigured } from '@/lib/store';

const Body = z.object({ prefixes: z.array(z.string().regex(/^[0-9a-f]{5}$/)).min(1).max(100) });

/**
 * Herd counts for the console, by 5-hex prefix only (the same k-anonymity as a phone's lookup):
 * the browser sends prefixes, gets every entry under them, and keeps the ones it was looking for.
 * Mule Watch and Pay Check can therefore check a bank's or company's own accounts without
 * revealing which ones they hold.
 */
export async function POST(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 4096);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  return json({ matches: await herdLookupMany(p.data.prefixes) });
}
