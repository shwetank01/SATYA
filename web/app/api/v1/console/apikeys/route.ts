export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { dailyCap, newKey } from '@/lib/apikeys';
import { fail, isResponse, json, readJson, requireBank } from '@/lib/gateway';
import { addApiKey, dayOf, listApiKeys, logAction, revokeApiKey, storeConfigured, usageOf } from '@/lib/store';

/** This bank's API keys (never the secret or its hash) and 30 days of usage. */
export async function GET(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const now = Date.now();
  const days = Array.from({ length: 30 }, (_, i) => dayOf(new Date(now - (29 - i) * 86_400_000)));
  const [keys, usage] = await Promise.all([listApiKeys(u.org), usageOf(u.org, [...new Set(days.map((d) => d.slice(0, 7)))])]);
  return json({
    keys: keys.map(({ hash: _h, ...k }) => k),
    usage: days.map((day) => ({ day, n: usage[day] ?? 0 })),
    daily_cap: dailyCap(),
  });
}

/** Creates a key and returns it once. */
export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  if ((await listApiKeys(u.org)).filter((k) => !k.revoked_at).length >= 10) return fail(409, 'too_many_keys');
  const { key, row } = newKey(u.org, u.user);
  await addApiKey(u.org, row);
  await logAction(u.org, u.user, 'api_key_created', row.prefix + '…');
  return json({ key, id: row.id, prefix: row.prefix }, 201);
}

const Del = z.object({ id: z.string().uuid() });

export async function DELETE(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 256);
  if (isResponse(body)) return body;
  const p = Del.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const row = await revokeApiKey(u.org, p.data.id, u.user);
  if (!row) return fail(404, 'not_found');
  await logAction(u.org, u.user, 'api_key_revoked', row.prefix + '…');
  return json(null, 204);
}
