export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, isResponse, json, requireConsole } from '@/lib/gateway';
import { listAudit, storeConfigured } from '@/lib/store';

/** This org's audit trail, newest first: who signed in, opened, blocked, published or released what. */
export async function GET(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  return json({ items: await listAudit(u.org) });
}
