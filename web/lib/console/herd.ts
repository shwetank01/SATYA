'use client';
import { api } from './client';

export interface HerdCount { h: string; t: string; seen_7d: number; reports: number; confirmed_by: string | null; label: string | null }

/** Looks up exact hashes through the prefix-only console route; the server never sees the full hash. */
export async function herdCounts(hashes: string[]): Promise<Map<string, HerdCount>> {
  const want = new Set(hashes);
  const prefixes = [...new Set(hashes.map((h) => h.slice(0, 5)))];
  const out = new Map<string, HerdCount>();
  for (let i = 0; i < prefixes.length; i += 100) {
    const r = await api<{ matches: HerdCount[] }>('/console/herd', { method: 'POST', body: JSON.stringify({ prefixes: prefixes.slice(i, i + 100) }) });
    for (const m of r.matches) if (want.has(m.h)) out.set(m.h, m);
  }
  return out;
}
