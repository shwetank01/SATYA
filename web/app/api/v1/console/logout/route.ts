export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { clearCookie } from '@/lib/console/auth';
import { json } from '@/lib/gateway';

export async function POST() {
  return json(null, 204, { 'set-cookie': clearCookie() });
}
