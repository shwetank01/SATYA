export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db, fail, isResponse, json, readJson, requireApp } from '@/lib/gateway';
import { b64decode, receiptMessage, sealedHashOf, signHex } from '@/lib/satya/crypto';

const Envelope = z.object({
  v: z.literal(1),
  bank_id: z.string().regex(/^[A-Z0-9_]{2,16}$/),
  channel: z.enum(['sms', 'call', 'whatsapp', 'email', 'screen', 'video', 'voice', 'app']),
  rules: z.array(z.string().regex(/^[A-Z0-9_]{3,64}$/)).max(20),
  severity: z.enum(['critical', 'high', 'medium', 'none']),
  indicators: z.array(z.object({ t: z.enum(['upi', 'tel', 'host', 'app']), h: z.string().regex(/^[0-9a-f]{64}$/) })).max(20),
  hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
  sealed: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(2_800_000),
  ticket_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * DOOT inbox (Section 8.5): validate -> bank has a box key -> sealed_hash -> sign the receipt ->
 * ingest_report (atomic) -> respond. The cloud stores a box it cannot open.
 */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const body = await readJson(req, 3_000_000);
  if (isResponse(body)) return body;
  const p = Envelope.safeParse(body);
  if (!p.success) return fail(400, 'invalid_envelope');
  const e = p.data;
  const { data: org } = await db().from('orgs').select('id,box_pk,type').eq('id', e.bank_id).maybeSingle();
  if (!org || org.type !== 'bank' || !org.box_pk) return fail(404, 'bank_cannot_receive_reports');
  let sealed: Uint8Array;
  try { sealed = await b64decode(e.sealed); } catch { return fail(400, 'invalid_sealed'); }
  if (sealed.length > 2 * 1024 * 1024) return fail(413, 'too_large');
  if (sealed.length < 48) return fail(400, 'invalid_sealed');
  const sealedHash = sealedHashOf(sealed);
  const reportId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const sk = process.env.SATYA_RECEIPT_SK;
  if (!sk) return fail(500, 'not_configured');
  const sig = await signHex(receiptMessage(reportId, sealedHash, receivedAt), sk);
  const { error } = await db().rpc('ingest_report', {
    p_id: reportId, p_bank: e.bank_id, p_channel: e.channel, p_rules: e.rules, p_severity: e.severity,
    p_hashes: e.indicators.map((i) => i.h), p_types: e.indicators.map((i) => i.t), p_hour: e.hour,
    p_sealed: e.sealed, p_sealed_hash: sealedHash, p_receipt: sig, p_ticket_hash: e.ticket_hash,
    p_received_at: receivedAt, p_seeded: false,
  });
  if (error) return fail(500, 'ingest_failed');
  return json({ report_id: reportId, received_at: receivedAt, sealed_hash: sealedHash, receipt_sig: sig }, 201);
}
