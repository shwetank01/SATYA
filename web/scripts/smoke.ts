// End-to-end smoke test of a deployed gateway + NYAYA console, the way a phone and a bank use it:
// health -> registry -> AI analyze -> herd -> sealed report -> console login -> inbox -> open with
// the bank's Box key -> brief -> kill -> phone sees "blocked" -> herd shows the confirmation, then
// the institution features (Overview, Radar herd, Promise Card, Mule Watch, audit, export, the
// partner API, and a company's Pay Check with Verify Before Release). Everything it wrote is
// removed at the end unless --keep is given.
// Usage: npx tsx --env-file=.env.local scripts/smoke.ts [https://satya-gateway.vercel.app] [--keep]
import fs from 'node:fs';
import path from 'node:path';
import { boxKeyOf } from '../lib/bundle';
import { openSealedB64Text, randomHex, receiptMessage, sealB64, verifyHex } from '../lib/satya/crypto';
import { dayToken, fromHex, sha256Hex, ticketHash } from '../lib/satya/hash';
import { maskedLabel, upi } from '../lib/satya/normalize';
import { deleteReport, herdForget, removeFromBlocklist, update, type PayCheckRecord } from '../lib/store';

const KEEP = process.argv.includes('--keep');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'https://satya-gateway.vercel.app').replace(/\/+$/, '');
const APP = { 'x-satya-app': process.env.SATYA_APP_KEY ?? '', 'content-type': 'application/json' };
const KEYS = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'keys', 'demo_keys.json'), 'utf8'));
let cookie = '';
let failed = 0;

async function call(method: string, p: string, body?: unknown, headers: Record<string, string> = APP) {
  const t = Date.now();
  const r = await fetch(BASE + p, { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, j, ms: Date.now() - t };
}

async function step(name: string, fn: () => Promise<string>) {
  try { console.log(`PASS  ${name.padEnd(34)} ${await fn()}`); } catch (e) { failed++; console.log(`FAIL  ${name.padEnd(34)} ${(e as Error).message}`); }
}
function need(c: unknown, msg: string): asserts c { if (!c) throw new Error(msg); }

const scamUpi = `smoke.${(await randomHex(3))}@ybl`;
const ind = upi(scamUpi);
let reportId = ''; let ticket = '';

await step('health', async () => { const r = await call('GET', '/api/v1/health'); need(r.j?.ok, JSON.stringify(r.j)); return `store ${r.j.store}, ai ${r.j.ai?.chat} · ${r.ms} ms`; });
await step('registry (signed cards + blocklist)', async () => { const r = await call('GET', '/api/v1/registry'); need(r.status === 200 && r.j.banks?.length === 5, `HTTP ${r.status}`); return `${r.j.banks.length} banks, ${r.j.blocklist.length} blocked · ${r.ms} ms`; });
await step('AI analyze (Sarvam)', async () => {
  const r = await call('POST', '/api/v1/ai/analyze', { text: 'Dear SBI customer pay Rs 10 KYC fee to [UPI_1] today or YONO will be blocked', hint_bank: 'SBI', channel: 'sms' });
  need(r.status === 200 && r.j.source === 'ai', JSON.stringify(r.j));
  return `${r.j.ask_type} / ${r.j.risk} (${r.j.confidence}) · ${r.ms} ms`;
});
await step('herd sighting + lookup', async () => {
  const token = dayToken(fromHex(await randomHex(32)), new Date().toISOString().slice(0, 10), ind.h);
  const s = await call('POST', '/api/v1/herd/sighting', { h: ind.h, t: 'upi', day_token: token });
  need(s.status === 204, `sighting HTTP ${s.status}`);
  const l = await call('GET', `/api/v1/herd/${ind.prefix}`);
  const m = l.j.matches?.find((x: any) => x.h === ind.h);
  need(m?.seen_7d >= 1, JSON.stringify(l.j));
  return `seen_7d ${m.seen_7d} · ${l.ms} ms`;
});
await step('report sealed to SBI, receipt verifies', async () => {
  ticket = await randomHex(32);
  const payload = { v: 1, created_at: new Date().toISOString(), source_app: 'smoke', channel: 'sms', claimed_bank: 'SBI', sender: 'VM-SMOKE', masked_text: `Pay KYC fee to ${scamUpi}`, raw_indicators: [{ t: 'upi', value: scamUpi }], rule_hits: [{ id: 'G08_NO_KYC_FEE', severity: 'critical', promise: 'smoke', issuer: 'GLOBAL', source: '', ai_assisted: false }], scores: { face: null, voice: null }, herd: { seen_7d: 1, reports: 0 }, timeline: [], screenshot_jpeg_b64: null, callback_number: null };
  const sealed = await sealB64(JSON.stringify(payload), boxKeyOf('SBI')!);
  const r = await call('POST', '/api/v1/reports', { v: 1, bank_id: 'SBI', channel: 'sms', rules: ['G08_NO_KYC_FEE'], severity: 'critical', indicators: [{ t: 'upi', h: ind.h }], hour: new Date().toISOString().slice(0, 13), sealed, ticket_hash: ticketHash(ticket) });
  need(r.status === 201, `HTTP ${r.status} ${JSON.stringify(r.j)}`);
  need(await verifyHex(receiptMessage(r.j.report_id, r.j.sealed_hash, r.j.received_at), r.j.receipt_sig, process.env.SATYA_RECEIPT_PK!), 'receipt signature invalid');
  reportId = r.j.report_id;
  return `${reportId.slice(0, 8)} · ${r.ms} ms`;
});
await step('phone status = delivered', async () => { const r = await call('GET', `/api/v1/reports/${reportId}/status`, undefined, { ...APP, 'x-satya-ticket': ticket }); need(r.j?.status === 'delivered', JSON.stringify(r.j)); return r.j.status; });
await step('console refuses without a session', async () => { const r = await call('GET', '/api/v1/reports', undefined, {}); need(r.status === 401, `HTTP ${r.status}`); return '401'; });
await step('console login (SBI)', async () => { const r = await call('POST', '/api/v1/console/login', { org: 'SBI', user: 'Smoke test', password: process.env.NYAYA_PASSWORD }, { 'content-type': 'application/json' }); need(r.status === 200 && cookie, `HTTP ${r.status}`); return r.j.orgName; });
await step('inbox lists the report', async () => { const r = await call('GET', '/api/v1/reports', undefined, {}); need(r.j.items?.some((x: any) => x.id === reportId), 'not in inbox'); return `${r.j.items.length} report(s)`; });
await step('bank opens the box in "browser"', async () => {
  const r = await call('GET', `/api/v1/reports/${reportId}/sealed`, undefined, {});
  const text = await openSealedB64Text(r.j.sealed, KEYS.SBI.box.pk, KEYS.SBI.box.sk);
  need(JSON.parse(text).raw_indicators[0].value === scamUpi, 'payload mismatch');
  const o = await call('POST', `/api/v1/reports/${reportId}/opened`, undefined, {});
  need(o.status === 204, `opened HTTP ${o.status}`);
  return `sha ${sha256Hex(text).slice(0, 10)}…`;
});
await step('AI case brief', async () => { const r = await call('POST', '/api/v1/ai/brief', { masked_text: `Pay KYC fee to ${scamUpi}`, rule_hits: [{ id: 'G08_NO_KYC_FEE' }], claimed_bank: 'SBI' }, { 'content-type': 'application/json' }); need(r.j?.source === 'ai', JSON.stringify(r.j)); return `${r.j.recommended_action} · ${r.ms} ms`; });
await step('kill -> blocked for everyone', async () => { const r = await call('POST', '/api/v1/kill', { indicators: [{ t: 'upi', h: ind.h, label: maskedLabel('upi', ind.canonical) }] }, { 'content-type': 'application/json' }); need(r.status === 200 && r.j.blocked_reports >= 1, JSON.stringify(r.j)); return `${r.j.blocked_reports} report(s) closed`; });
await step('phone status = blocked', async () => { const r = await call('GET', `/api/v1/reports/${reportId}/status`, undefined, { ...APP, 'x-satya-ticket': ticket }); need(r.j?.status === 'blocked', JSON.stringify(r.j)); return r.j.status; });
await step('registry carries the block', async () => { const r = await call('GET', '/api/v1/registry'); need(r.j.blocklist.some((b: any) => b.h === ind.h), 'not in blocklist'); return `${r.j.blocklist.length} blocked`; });
await step('herd shows confirmed_by SBI', async () => { const l = await call('GET', `/api/v1/herd/${ind.prefix}`); const m = l.j.matches.find((x: any) => x.h === ind.h); need(m?.confirmed_by === 'SBI', JSON.stringify(m)); return `reports ${m.reports}`; });

const J = { 'content-type': 'application/json' };
let apiKey = ''; let keyId = ''; let payId = '';
await step('Overview metrics', async () => { const r = await call('GET', '/api/v1/console/metrics', undefined, {}); need(r.status === 200 && r.j.reports_30d >= 1, JSON.stringify(r.j)); return `${r.j.reports_30d} reports, ${r.j.blocked_by_you} blocked by SBI · ${r.ms} ms`; });
await step('Radar herd by prefix only', async () => { const r = await call('POST', '/api/v1/console/herd', { prefixes: [ind.prefix] }, J); need(r.j.matches?.some((m: any) => m.h === ind.h), JSON.stringify(r.j)); return `${r.j.matches.length} under ${ind.prefix}`; });
await step('Promise Card for SBI', async () => { const r = await call('GET', '/api/v1/cards', undefined, {}); need(r.status === 200 && r.j.cert?.sign_pk && r.j.bank_cards?.length === 5, `HTTP ${r.status}`); return `v${r.j.card.version}, signed by ${r.j.card.signed_by}`; });
await step('Mule Watch', async () => { const r = await call('GET', '/api/v1/console/mules', undefined, {}); need(r.status === 200 && Array.isArray(r.j.items), `HTTP ${r.status}`); return `${r.j.items.length} alert(s)`; });
await step('audit trail names the analyst', async () => { const r = await call('GET', '/api/v1/console/audit', undefined, {}); need(r.j.items?.some((e: any) => e.user === 'Smoke test' && e.action === 'blocked_for_everyone'), 'kill not in audit'); return `${r.j.items.length} entries`; });
await step('case register CSV', async () => { const r = await call('GET', '/api/v1/console/export', undefined, {}); need(r.status === 200 && String(r.j).includes(reportId), `HTTP ${r.status}`); return `${String(r.j).trim().split('\n').length - 1} line(s)`; });
await step('partner API: key, call, revoke', async () => {
  const k = await call('POST', '/api/v1/console/apikeys', undefined, {});
  need(k.status === 201, `create HTTP ${k.status}`);
  apiKey = k.j.key; keyId = k.j.id;
  const c = await call('POST', '/api/v1/partner/check', { text: 'Dear SBI customer pay Rs 10 KYC fee to sbi.kyc.help@ybl today', channel: 'sms', sender: '+91 70421 88310', ai: false }, { ...J, authorization: `Bearer ${apiKey}` });
  need(c.status === 200 && c.j.verdict === 'breaks', JSON.stringify(c.j));
  await call('DELETE', '/api/v1/console/apikeys', { id: keyId }, J);
  const after = await call('POST', '/api/v1/partner/check', { text: 'x', ai: false }, { ...J, authorization: `Bearer ${apiKey}` });
  need(after.status === 401, `revoked key HTTP ${after.status}`);
  return `${c.j.verdict} (${c.j.broken_promises.length} promises) · ${c.ms} ms, revoked -> 401`;
});
await step('company login (Acme) is refused bank data', async () => {
  const r = await call('POST', '/api/v1/console/login', { org: 'ACME', user: 'Smoke test', password: process.env.NYAYA_PASSWORD }, J);
  need(r.status === 200 && r.j.kind === 'company', `HTTP ${r.status}`);
  const b = await call('GET', '/api/v1/reports', undefined, {});
  need(b.status === 403, `reports HTTP ${b.status}`);
  return 'company, reports -> 403';
});
await step('Pay Check P01 -> hold -> callback denied -> blocked', async () => {
  const c = await call('POST', '/api/v1/pay/checks', { requester: 'R. Mehta', channel: 'voice_note', amount_inr: 480000, request_hash: sha256Hex('smoke P01'), summary: 'smoke: Rs 4.8 lakh to a/c ••••6780', flags: ['NEW_ACCOUNT', 'OVER_LIMIT', 'URGENT_SECRET', 'WRONG_CHANNEL'], voice_score: null }, J);
  need(c.status === 201 && c.j.decision === 'hold', JSON.stringify(c.j));
  payId = c.j.id;
  const v = await call('POST', `/api/v1/pay/checks/${payId}`, { result: 'denied' }, J);
  need(v.j.decision === 'blocked', JSON.stringify(v.j));
  need(await verifyHex(v.j.receipt.message, v.j.receipt.sig, process.env.SATYA_RECEIPT_PK!), 'pay receipt signature invalid');
  return `blocked, receipt verifies · ${v.ms} ms`;
});

if (!KEEP) {
  await step('clean up what this run wrote', async () => {
    await deleteReport('SBI', reportId);
    await removeFromBlocklist((b) => b.h === ind.h);
    await herdForget([ind.h]);
    if (payId) await update<PayCheckRecord[]>('pay/ACME/checks.json', () => [], (rows) => rows.filter((r) => r.id !== payId));
    return 'report, block, herd entry and pay check removed';
  });
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
