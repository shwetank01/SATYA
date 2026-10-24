export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db, json } from '@/lib/gateway';

/** C1: gateway up, database reachable, VIVEK reachable (no auth, no secrets in the answer). */
export async function GET() {
  let dbOk = false;
  try {
    const { error } = await db().from('orgs').select('id', { head: true, count: 'exact' }).limit(1);
    dbOk = !error;
  } catch { dbOk = false; }
  let vivek: boolean | null = null;
  const url = process.env.VIVEK_URL;
  if (url) {
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/health', { headers: { 'x-satya-app': process.env.SATYA_APP_KEY ?? '' }, signal: AbortSignal.timeout(4000) });
      vivek = r.ok;
    } catch { vivek = false; }
  }
  return json({ ok: dbOk, db: dbOk, vivek, version: '0.1.0' });
}
