// NYAYA sign-in without a user database: an analyst picks their institution, types their name and
// enters the console password. The session is an HMAC-signed, HttpOnly cookie holding the org id,
// the analyst's name (for the audit trail) and an expiry. The bank's Box key never comes here:
// reports are opened in the browser (lib/console/client.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ANALYST, ORGS, type OrgKind } from '../orgs';

export const COOKIE = 'nyaya_session';
const TTL_S = 12 * 3600;

const secret = () => process.env.NYAYA_SECRET ?? '';

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function sessionCookie(org: string, user: string): string {
  const body = Buffer.from(JSON.stringify({ org, user, exp: Math.floor(Date.now() / 1000) + TTL_S })).toString('base64url');
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_S}${secure}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export interface Session { org: string; orgName: string; kind: OrgKind; user: string }

export function readSession(cookieHeader: string | null): Session | null {
  if (!secret()) return null;
  const raw = (cookieHeader ?? '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)); const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { org, user, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    const o = typeof org === 'string' ? ORGS[org] : undefined;
    // Sessions from before named analysts carry no `user`; they sign in again.
    if (!o || typeof user !== 'string' || !ANALYST.test(user) || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return { org: o.id, orgName: o.name, kind: o.kind, user };
  } catch {
    return null;
  }
}

const equal = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * The org's own password when NYAYA_ORG_PASSWORDS (JSON, e.g. {"SBI":"…"}) names it, otherwise the
 * deployment's shared NYAYA_PASSWORD. Constant time; passwords under 8 characters never match.
 */
export function passwordOk(given: string, org?: string): boolean {
  let want = process.env.NYAYA_PASSWORD ?? '';
  if (org && process.env.NYAYA_ORG_PASSWORDS) {
    try {
      const own = JSON.parse(process.env.NYAYA_ORG_PASSWORDS)[org];
      if (typeof own === 'string') want = own;
    } catch { /* malformed: fall back to the shared password */ }
  }
  return want.length >= 8 && equal(given, want);
}
