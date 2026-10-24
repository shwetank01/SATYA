export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'node:crypto';
import { db, fail, json, requireApp } from '@/lib/gateway';
import { ticketHash } from '@/lib/satya/hash';

/** Status for the phone that holds the ticket (sent in X-Satya-Ticket, never in the URL). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireApp(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, 'bad_id');
  const ticket = req.headers.get('x-satya-ticket') ?? '';
  if (!/^[0-9a-f]{64}$/.test(ticket)) return fail(403, 'forbidden');
  const { data } = await db().from('reports').select('status,updated_at,ticket_hash').eq('id', id).maybeSingle();
  if (!data) return fail(404, 'not_found');
  const a = Buffer.from(ticketHash(ticket)); const b = Buffer.from(data.ticket_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail(403, 'forbidden');
  return json({ status: data.status, updated_at: data.updated_at });
}
