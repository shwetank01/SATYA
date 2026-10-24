export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireApp } from '@/lib/gateway';
import { herdSight, storeConfigured } from '@/lib/store';

const Body = z.object({ h: z.string().regex(/^[0-9a-f]{64}$/), t: z.enum(['upi', 'tel', 'host', 'app']), day_token: z.string().regex(/^[0-9a-f]{64}$/) });

/** One sighting per (hash, day_token): idempotent, no IP or device stored. */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  try {
    await herdSight(p.data.h, p.data.t, p.data.day_token);
  } catch {
    return fail(500, 'sighting_failed');
  }
  return json(null, 204);
}
