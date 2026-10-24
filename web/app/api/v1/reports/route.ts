export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { boxKeyOf } from '@/lib/bundle';
import { fail, isResponse, json, readJson, requireApp, requireConsole } from '@/lib/gateway';
import { b64decode, receiptMessage, sealedHashOf, signHex } from '@/lib/satya/crypto';
import { herdReport, listReports, saveReport, storeConfigured } from '@/lib/store';

const Envelope = z.object({
  v: z.literal(1),
  bank_id: z.string().regex(/^[A-Z0-9_]{2,16}$/),
  channel: z.enum(['sms', 'call', 'whatsapp', 'email', 'screen', 'video', 'voice', 'app']),
  rules: z.array(z.string().regex(/^[A-Z0-9_]{3,64}$/)).max(20),
  severity: z.enum(['critical', 'high', 'medium', 'none']),
  indicators: z.array(z.object({ t: z.enum(['upi', 'tel', 'host', 'app', 'acct']), h: z.string().regex(/^[0-9a-f]{64}$/) })).max(20),
  hour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
  sealed: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(2_800_000),
  ticket_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * DOOT inbox (Section 8.5): validate -> bank has a box key -> sealed_hash -> sign the receipt ->
 * store -> respond. The gateway stores a box it cannot open: only the bank's browser holds the key.
 */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 3_000_000);
  if (isResponse(body)) return body;
  const parsed = Envelope.safeParse(body);
  if (!parsed.success) return fail(400, 'invalid_envelope');
  const e = parsed.data;
  if (!boxKeyOf(e.bank_id)) return fail(404, 'bank_cannot_receive_reports');
  let sealed: Uint8Array;
  try { sealed = await b64decode(e.sealed); } catch { return fail(400, 'invalid_sealed'); }
  if (sealed.length > 2 * 1024 * 1024) return fail(413, 'too_large');
  if (sealed.length < 48) return fail(400, 'invalid_sealed');
  const sk = process.env.SATYA_RECEIPT_SK;
  if (!sk) return fail(500, 'not_configured');
  const sealedHash = sealedHashOf(sealed);
  const id = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const sig = await signHex(receiptMessage(id, sealedHash, receivedAt), sk);
  try {
    await saveReport({
      id, bank_id: e.bank_id, channel: e.channel, rules: e.rules, severity: e.severity, indicators: e.indicators, hour: e.hour,
      sealed: e.sealed, sealed_hash: sealedHash, receipt_sig: sig, ticket_hash: e.ticket_hash, received_at: receivedAt,
      status: 'delivered', updated_at: receivedAt,
    });
  } catch {
    return fail(500, 'store_failed');
  }
  // Herd "reports" counts are best effort; a delivered report never fails on them.
  await herdReport(e.indicators).catch(() => {});
  return json({ report_id: id, received_at: receivedAt, sealed_hash: sealedHash, receipt_sig: sig }, 201);
}

/** NYAYA inbox: this bank's reports, newest first (tags only; the sealed box is fetched per case). */
export async function GET(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  return json({ items: await listReports(u.org) });
}
