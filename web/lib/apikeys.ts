// Partner API keys (Section 23.8): `nyaya_live_<org>_<40 hex>`. The org is readable from the key so
// the gateway knows which key file to check; the secret part is 160 random bits. Stored as SHA-256.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './satya/hash';
import { ORGS } from './orgs';
import { listApiKeys, type ApiKeyRow } from './store';

const KEY = /^nyaya_live_([a-z]{2,16})_([0-9a-f]{40})$/;

/** Daily calls allowed per bank (NYAYA_API_DAILY_CAP), so a leaked key cannot drain the AI budget. */
export const dailyCap = () => Math.max(1, Number(process.env.NYAYA_API_DAILY_CAP ?? 500) || 500);

export function newKey(org: string, user: string): { key: string; row: ApiKeyRow } {
  const key = `nyaya_live_${org.toLowerCase()}_${randomBytes(20).toString('hex')}`;
  return {
    key,
    row: { id: crypto.randomUUID(), prefix: key.slice(0, `nyaya_live_${org.toLowerCase()}_`.length + 4), hash: sha256Hex(key), created_at: new Date().toISOString(), created_by: user, revoked_at: null, revoked_by: null },
  };
}

/** The bank a bearer key belongs to, or null for a malformed, unknown or revoked key. */
export async function orgOfKey(authorization: string | null): Promise<{ org: string; key: ApiKeyRow } | null> {
  const m = (authorization ?? '').match(/^Bearer\s+(\S+)$/i)?.[1]?.match(KEY);
  if (!m) return null;
  const org = m[1].toUpperCase();
  if (ORGS[org]?.kind !== 'bank') return null;
  const want = Buffer.from(sha256Hex(m[0]));
  for (const row of await listApiKeys(org)) {
    const got = Buffer.from(row.hash);
    if (!row.revoked_at && got.length === want.length && timingSafeEqual(got, want)) return { org, key: row };
  }
  return null;
}
