'use client';
// Browser side of NYAYA: same-origin calls to /api/v1 (the session is an HttpOnly cookie) and the
// bank's keys in this browser's IndexedDB. The keys never go to the server.
import { del, get, set } from 'idb-keyval';

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const isJson = init.body && typeof init.body === 'string';
  const r = await fetch('/api/v1' + path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(isJson ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  if (r.status === 204) return null as T;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j as T;
}

export interface OrgKeys { sign: { pk: string; sk: string }; box: { pk: string; sk: string } | null }

/** Keeps only this org's keys from a key file (e.g. keys/demo_keys.json). */
export async function importKeys(file: string, org: string): Promise<boolean> {
  const all = JSON.parse(file);
  const k = all[org];
  if (!k?.box?.sk) return false;
  await set(`satya-keys-${org}`, { sign: k.sign ?? null, box: k.box });
  return true;
}
export const getKeys = (org: string) => get<OrgKeys>(`satya-keys-${org}`);
export const forgetKeys = (org: string) => del(`satya-keys-${org}`);
