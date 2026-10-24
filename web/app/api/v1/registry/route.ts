export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, json, requireApp } from '@/lib/gateway';
import { bundleFromDb } from '@/lib/registry';

/** VACHAN (Section 8.7): GLOBAL card + each bank's certificate and card + blocklist. */
export async function GET(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  try {
    return json(await bundleFromDb());
  } catch {
    return fail(500, 'registry_unavailable');
  }
}
