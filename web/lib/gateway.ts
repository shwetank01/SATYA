// Shared plumbing for the /api/v1 route handlers (Section 10).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

export type Fail = { error: string; status: number };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === null ? {} : { 'content-type': 'application/json; charset=utf-8' }), 'cache-control': 'no-store', ...headers },
  });

export const fail = (status: number, error: string) => json({ error }, status);

let service: SupabaseClient | null = null;
/** Service-role client: bypasses RLS, server only. Never exported to the browser. */
export function db(): SupabaseClient {
  if (!service) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('supabase_not_configured');
    service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return service;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** App auth: X-Satya-App must equal SATYA_APP_KEY (constant time). */
export function requireApp(req: Request): Response | null {
  const key = process.env.SATYA_APP_KEY ?? '';
  return same(req.headers.get('x-satya-app') ?? '', key) ? null : fail(401, 'unauthorized');
}

export interface ConsoleUser { userId: string; email: string | null; orgs: string[] }

/** Console auth: Bearer <supabase access token> + membership rows. */
export async function requireConsole(req: Request): Promise<ConsoleUser | Response> {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return fail(401, 'unauthorized');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return fail(401, 'unauthorized');
  const { data: rows } = await db().from('members').select('org_id').eq('user_id', data.user.id);
  return { userId: data.user.id, email: data.user.email ?? null, orgs: (rows ?? []).map((r: any) => r.org_id) };
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
export const nowIso = () => new Date().toISOString();
