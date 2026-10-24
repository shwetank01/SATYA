'use client';
// Browser side of NYAYA: Supabase session (anon key + RLS), authed calls to /api/v1, bank keys in IndexedDB.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';

let sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!sb) sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: true } });
  return sb;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch('/api/v1' + path, {
    ...init,
    headers: { ...(init.body && !(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer) ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
  });
  if (r.status === 204) return null as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j as T;
}

export interface OrgKeys { sign: { pk: string; sk: string }; box: { pk: string; sk: string } | null }

/** Only this org's keys are kept, in this browser's IndexedDB; they never go to the server. */
export async function importKeys(file: string, org: string): Promise<boolean> {
  const all = JSON.parse(file);
  const k = all[org];
  if (!k?.sign?.sk) return false;
  await set(`satya-keys-${org}`, k);
  return true;
}
export const getKeys = (org: string) => get<OrgKeys>(`satya-keys-${org}`);
