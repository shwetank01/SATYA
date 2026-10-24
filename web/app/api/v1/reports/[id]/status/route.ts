export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'node:crypto';
import { fail, json, requireApp, UUID } from '@/lib/gateway';
import { ticketHash } from '@/lib/satya/hash';
import { getReport } from '@/lib/store';

/** Status for the phone that holds the ticket (sent in X-Satya-Ticket, never in the URL). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireApp(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return fail(400, 'bad_id');
  const ticket = req.headers.get('x-satya-ticket') ?? '';
  if (!/^[0-9a-f]{64}$/.test(ticket)) return fail(403, 'forbidden');
  const r = await getReport(id);
  if (!r) return fail(404, 'not_found');
  const a = Buffer.from(ticketHash(ticket)); const b = Buffer.from(r.ticket_hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail(403, 'forbidden');
  return json({ status: r.status, updated_at: r.updated_at });
}
