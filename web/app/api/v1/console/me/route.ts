export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { isResponse, json, requireConsole } from '@/lib/gateway';

export async function GET(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  return json({ org: u.org, orgName: u.orgName });
}
