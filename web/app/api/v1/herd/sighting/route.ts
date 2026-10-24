export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db, fail, isResponse, json, readJson, requireApp } from '@/lib/gateway';

const Body = z.object({ h: z.string().regex(/^[0-9a-f]{64}$/), t: z.enum(['upi', 'tel', 'host', 'app']), day_token: z.string().regex(/^[0-9a-f]{64}$/) });

/** One sighting per (hash, day_token): idempotent, no IP or device stored. */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const { error } = await db().rpc('herd_sight', { p_hash: p.data.h, p_type: p.data.t, p_token: p.data.day_token });
  if (error) return fail(500, 'sighting_failed');
  return json(null, 204);
}
