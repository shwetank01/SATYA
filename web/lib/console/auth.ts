// NYAYA sign-in without a user database: a bank picks itself and enters the console password
// (NYAYA_PASSWORD); the session is an HMAC-signed, HttpOnly cookie holding only the bank id and expiry.
// The bank's Box key never comes here: reports are opened in the browser (lib/console/client.ts).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BANK_NAMES } from '../bundle';

export const COOKIE = 'nyaya_session';
const TTL_S = 12 * 3600;

const secret = () => process.env.NYAYA_SECRET ?? '';

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function sessionCookie(org: string): string {
  const body = Buffer.from(JSON.stringify({ org, exp: Math.floor(Date.now() / 1000) + TTL_S })).toString('base64url');
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_S}${secure}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

export interface Session { org: string; orgName: string }

export function readSession(cookieHeader: string | null): Session | null {
  if (!secret()) return null;
  const raw = (cookieHeader ?? '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)); const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { org, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof org !== 'string' || !(org in BANK_NAMES) || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
    return { org, orgName: BANK_NAMES[org] };
  } catch {
    return null;
  }
}

export function passwordOk(given: string): boolean {
  const want = process.env.NYAYA_PASSWORD ?? '';
  const a = Buffer.from(given); const b = Buffer.from(want);
  return want.length >= 8 && a.length === b.length && timingSafeEqual(a, b);
}
