export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { CHAT_MODEL, STT_MODEL, sarvamConfigured } from '@/lib/ai/sarvam';
import { json } from '@/lib/gateway';
import { readJson, storeConfigured } from '@/lib/store';
import pkg from '@/package.json';

/** C1: gateway up, store reachable, AI configured (no auth, no secrets in the answer). */
export async function GET() {
  let store = false;
  if (storeConfigured()) {
    try { await readJson('blocklist.json'); store = true; } catch { store = false; }
  }
  const ai = sarvamConfigured();
  return json({ ok: store && ai, store, db: store, ai: ai ? { provider: 'sarvam', chat: CHAT_MODEL, stt: STT_MODEL } : null, version: pkg.version });
}
