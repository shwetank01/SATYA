// Shared plumbing for the /api/v1 route handlers (Section 10).
import { timingSafeEqual } from 'node:crypto';
import { readSession, type Session } from './console/auth';

export type Fail = { error: string; status: number };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === null ? {} : { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', ...headers },
  });

export const fail = (status: number, error: string) => json({ error }, status);

function same(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** App auth: X-Satya-App must equal SATYA_APP_KEY (constant time). */
export function requireApp(req: Request): Response | null {
  const key = process.env.SATYA_APP_KEY ?? '';
  return same(req.headers.get('x-satya-app') ?? '', key) ? null : fail(401, 'unauthorized');
}

export interface ConsoleUser extends Session { orgs: string[] }

/** Console auth: the signed NYAYA session cookie (lib/console/auth.ts). */
export function requireConsole(req: Request): ConsoleUser | Response {
  const s = readSession(req.headers.get('cookie'));
  return s ? { ...s, orgs: [s.org] } : fail(401, 'unauthorized');
}

/** Routes both the phone and the console use (AI analysis, speech-to-text). */
export function requireAppOrConsole(req: Request): Response | null {
  if (!requireApp(req)) return null;
  return readSession(req.headers.get('cookie')) ? null : fail(401, 'unauthorized');
}

export async function readJson(req: Request, maxBytes: number): Promise<unknown | Response> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) return fail(413, 'too_large');
  const text = await req.text();
  if (text.length > maxBytes) return fail(413, 'too_large');
  try { return JSON.parse(text); } catch { return fail(400, 'invalid_json'); }
}

export const isResponse = (x: unknown): x is Response => x instanceof Response;
export const HEX64 = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const nowIso = () => new Date().toISOString();
