// Demo data for NYAYA (Section 23.10): a week of realistic, sealed customer reports for all five
// banks, scam campaigns, cross-bank mule accounts, herd sightings, blocks, and Acme's Pay Check
// history. Every record carries `demo: true` (shown as "Demo" in the console) and `clean` removes
// exactly what `seed` wrote. Reports are sealed to each bank's real Box public key and their rule
// hits come from the same rules a phone runs, so opening a case works like a real one.
//
//   npx tsx --env-file=.env.local scripts/demo-data.ts seed          # clean, then seed
//   npx tsx --env-file=.env.local scripts/demo-data.ts clean
//   npx tsx --env-file=.env.local scripts/demo-data.ts clean-smoke   # remove smoke-test leftovers
//   npx tsx scripts/demo-data.ts plan                                # print the scenarios, write nothing
//
// SATYA_STORE_PREFIX (e.g. dev/) is respected, so a local namespace can be seeded first.
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLE, PROMISES, RULE_BOOK, boxKeyOf } from '../lib/bundle';
import { DEMO_MULES } from '../lib/demo';
import { signPayReceipt } from '../lib/payreceipt';
import { openSealedB64Text, receiptMessage, sealB64, sealedHashOf, signHex, b64decode } from '../lib/satya/crypto';
import { sha256Hex } from '../lib/satya/hash';
import { maskedLabel, normalize, type IndicatorType } from '../lib/satya/normalize';
import { amounts } from '../lib/satya/paycheck';
import { bankOfIfsc, bankOfUpi } from '../lib/satya/psp';
import { evaluate, type ChannelWire } from '../lib/satya/rules';
import {
  create, getBlocklist, getReport, herdForget, herdPath, listPayChecks, listReports, logAction, readJson, remove, removeFromBlocklist, update,
  type BlockRow, type HerdFile, type PayCheckRecord, type PayRulesDoc, type ReportIndexRow, type StoredReport,
} from '../lib/store';

const MIN = 60_000; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
const NOW = Date.now();
const DEMO_USER = 'Demo data';

// Deterministic randomness, so every seed is the same world (anchored at "now").
let seed = 20261025;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

interface Scenario {
  bank: string;
  channel: ChannelWire;
  source_app: string;
  senders: string[];
  text: string;
  values: { t: IndicatorType; v: string }[];
  reports: number;
  /** Days ago of the first and last report. A blocked campaign is one burst ([d, d]: within hours). */
  span: [number, number];
  /** Blocked by this bank this many hours after the last report; undefined = still live. */
  killedAfterH?: number;
  dismiss?: number;
  /** Phones per day that met the value (herd sightings). */
  daily: [number, number];
}

const SMS = 'com.google.android.apps.messaging';
const WA = 'com.whatsapp';
const DIAL = 'com.google.android.dialer';

const SCENARIOS: Scenario[] = [
  // SBI
  { bank: 'SBI', channel: 'sms', source_app: SMS, senders: ['+91 70421 88310', '+91 70421 88317', '+91 63901 22745'], reports: 7, span: [6, 0], daily: [6, 19],
    text: 'Dear [NAME], your SBI YONO account will be blocked today. Pay Rs 10 KYC fee to sbi.kyc.help@ybl to keep it active.', values: [{ t: 'upi', v: 'sbi.kyc.help@ybl' }] },
  { bank: 'SBI', channel: 'whatsapp', source_app: WA, senders: ['+91 88265 41092'], reports: 4, span: [4, 4], killedAfterH: 2, daily: [9, 24],
    text: 'SBI Reward points worth Rs 7,250 expire today. Download the YONO Rewards app from sbi-rewards-yono.in and redeem now, [NAME].', values: [{ t: 'host', v: 'sbi-rewards-yono.in' }, { t: 'tel', v: '+91 88265 41092' }] },
  { bank: 'SBI', channel: 'call', source_app: DIAL, senders: ['+91 91234 56780'], reports: 3, span: [5, 5], killedAfterH: 1, daily: [3, 9],
    text: 'This is SBI fraud control. Your account is under investigation. Transfer your full balance to the RBI safe account we give you to protect it.', values: [{ t: 'tel', v: '+91 91234 56780' }] },
  { bank: 'SBI', channel: 'sms', source_app: SMS, senders: ['+91 79823 11406'], reports: 3, span: [3, 3], killedAfterH: 2, daily: [4, 12],
    text: 'SBI: your refund of Rs 4,999 is approved, [NAME]. Pay the Rs 25 verification fee to refund.desk@okhdfcbank to receive it today.', values: [{ t: 'upi', v: 'refund.desk@okhdfcbank' }] },
  { bank: 'SBI', channel: 'whatsapp', source_app: WA, senders: ['+91 90045 77213'], reports: 2, span: [2, 2], killedAfterH: 2, daily: [2, 8],
    text: 'Congratulations [NAME]! YONO cashback of Rs 1,500 is pending. Pay Rs 49 activation fee to yono.cashback@ibl to unlock it.', values: [{ t: 'upi', v: 'yono.cashback@ibl' }] },
  // HDFC
  { bank: 'HDFC', channel: 'call', source_app: DIAL, senders: ['+91 98765 01234'], reports: 5, span: [5, 0], dismiss: 1, daily: [5, 15],
    text: 'Sir HDFC fraud team here. A debit of Rs 49,999 is pending on your card. Tell me the OTP you just received to cancel it.', values: [{ t: 'tel', v: '+91 98765 01234' }] },
  { bank: 'HDFC', channel: 'sms', source_app: SMS, senders: ['+91 74110 52368'], reports: 4, span: [2, 2], killedAfterH: 3, daily: [6, 18],
    text: 'HDFC Credit Card reward for [NAME]: pay Rs 99 activation fee to rahul.kyc99@oksbi and get Rs 5,000 cashback today.', values: [{ t: 'upi', v: 'rahul.kyc99@oksbi' }] },
  { bank: 'HDFC', channel: 'sms', source_app: SMS, senders: ['+91 81307 66231'], reports: 3, span: [3, 1], daily: [3, 10],
    text: 'HDFC Bank: your PayZapp KYC expires today. Update it now at hdfc-payzapp-kyc.com or the wallet will be blocked.', values: [{ t: 'host', v: 'hdfc-payzapp-kyc.com' }] },
  // ICICI
  { bank: 'ICICI', channel: 'sms', source_app: SMS, senders: ['+91 70083 19045'], reports: 4, span: [4, 0], daily: [5, 14],
    text: 'ICICI Bank: iMobile Pay is blocked due to incomplete PAN, [NAME]. Update now at icici-pan-update.co to avoid account freeze.', values: [{ t: 'host', v: 'icici-pan-update.co' }] },
  { bank: 'ICICI', channel: 'sms', source_app: SMS, senders: ['+91 99872 30411'], reports: 3, span: [1, 1], killedAfterH: 1, daily: [3, 11],
    text: 'ICICI cashback of Rs 2,000 credited for [NAME]. Pay the Rs 20 verification fee to icici.cashback22@oksbi to withdraw it.', values: [{ t: 'upi', v: 'icici.cashback22@oksbi' }] },
  { bank: 'ICICI', channel: 'call', source_app: DIAL, senders: ['+91 80978 44120'], reports: 2, span: [2, 0], daily: [1, 4],
    text: 'ICICI net banking support here. Please install AnyDesk and share the code on screen so we can fix your account.', values: [{ t: 'tel', v: '+91 80978 44120' }] },
  // AXIS
  { bank: 'AXIS', channel: 'call', source_app: DIAL, senders: ['+91 99887 76655'], reports: 3, span: [3, 0], daily: [2, 7],
    text: 'Axis Bank credit card desk: your limit increase is approved. Share the OTP you get now to activate the new limit.', values: [{ t: 'tel', v: '+91 99887 76655' }] },
  { bank: 'AXIS', channel: 'whatsapp', source_app: WA, senders: ['+91 70219 98044'], reports: 3, span: [2, 2], killedAfterH: 2, daily: [3, 9],
    text: 'Axis Bank: [NAME], your account is frozen for verification. Transfer your balance to the verification account 50100123456780 IFSC HDFC0001234 to unfreeze it today.', values: [{ t: 'acct', v: '50100123456780/HDFC0001234' }] },
  { bank: 'AXIS', channel: 'sms', source_app: SMS, senders: ['+91 62004 71139'], reports: 2, span: [1, 1], killedAfterH: 2, daily: [2, 6],
    text: 'Axis Bank KYC alert for [NAME]: pay Rs 15 KYC fee to pnbone.kyc@pnb today or your debit card will be blocked.', values: [{ t: 'upi', v: 'pnbone.kyc@pnb' }] },
  // PNB
  { bank: 'PNB', channel: 'sms', source_app: SMS, senders: ['+91 73550 20918'], reports: 3, span: [3, 3], killedAfterH: 3, daily: [3, 10],
    text: 'PNB: [NAME], your PNB ONE KYC is pending. Pay Rs 10 KYC charge to kycupdate.pnb@okaxis today to avoid suspension.', values: [{ t: 'upi', v: 'kycupdate.pnb@okaxis' }] },
  { bank: 'PNB', channel: 'call', source_app: DIAL, senders: ['18001800'], reports: 2, span: [1, 0], daily: [1, 5],
    text: 'Namaste, PNB customer care speaking. Your account needs re-verification today, please confirm your details on this call.', values: [{ t: 'tel', v: '18001800' }] },
];

const RANK = { none: 0, medium: 1, high: 2, critical: 3 } as const;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const iso = (t: number) => new Date(t).toISOString();
const homeOf = (t: IndicatorType, v: string) => (t === 'upi' ? bankOfUpi(v) : t === 'acct' ? bankOfIfsc(v.split('/')[1] ?? '') : null);

/** Every hash the demo can write, recomputed from the fixed values (clean needs no state file). */
const demoHashes = () => [...new Set(SCENARIOS.flatMap((s) => s.values.map((x) => normalize(x.t, x.v).h)))];

async function seedReports() {
  const receiptSk = process.env.SATYA_RECEIPT_SK;
  if (!receiptSk) throw new Error('SATYA_RECEIPT_SK is not set (run with --env-file=.env.local)');
  const byBank = new Map<string, ReportIndexRow[]>();
  const herd = new Map<string, { t: string; reports: number; first: number; daily: [number, number]; killedAt?: number; by?: string; label?: string }>();
  const blocks: BlockRow[] = [];
  let n = 0;
  for (const sc of SCENARIOS) {
    const box = boxKeyOf(sc.bank);
    if (!box) throw new Error(`no box key for ${sc.bank}`);
    const ev = evaluate(RULE_BOOK, { text: sc.text, channel: sc.channel, sender: sc.senders[0] });
    const hits = ev.hits.map(([id, sev]) => ({ id, severity: sev, promise: PROMISES[id]?.promise ?? id, issuer: PROMISES[id]?.issuer ?? 'GLOBAL', source: PROMISES[id]?.source ?? '', ai_assisted: false }));
    const severity = hits.length ? hits.map((h) => h.severity).sort((a, b) => RANK[b as keyof typeof RANK] - RANK[a as keyof typeof RANK])[0] : 'medium';
    const inds = sc.values.map((x) => ({ x, n: normalize(x.t, x.v) }));
    const first = NOW - sc.span[0] * DAY - int(1, 8) * HOUR;
    const last = Math.min(NOW - 20 * MIN, NOW - sc.span[1] * DAY - int(0, 3) * HOUR);
    const killedAt = sc.killedAfterH !== undefined ? Math.min(NOW - 10 * MIN, last + sc.killedAfterH * HOUR + int(5, 50) * MIN) : undefined;
    console.log(`${sc.bank.padEnd(5)} ${String(sc.reports).padStart(2)}× ${sc.channel.padEnd(8)} ${(hits.map((h) => h.id).join(' + ') || 'AI only').padEnd(48)} ${killedAt ? 'blocked' : 'live'}`);
    for (let i = 0; i < sc.reports; i++) {
      const at = sc.reports === 1 ? last : Math.round(first + ((last - first) * i) / (sc.reports - 1));
      const sender = sc.senders[i % sc.senders.length];
      const payload = {
        v: 1, created_at: iso(at - int(2, 9) * MIN), source_app: sc.source_app, channel: sc.channel, claimed_bank: ev.bank ?? sc.bank, sender,
        masked_text: sc.text, raw_indicators: sc.values.map((x) => ({ t: x.t, value: x.v })), rule_hits: hits,
        scores: { face: null, voice: null }, herd: { seen_7d: int(3, 40), reports: i },
        timeline: [{ t: iso(at - 9 * MIN), event: `Received on ${sc.channel === 'call' ? 'a call' : sc.channel}` }, { t: iso(at - 4 * MIN), event: 'Checked with Circle to Check' }, { t: iso(at), event: `Reported to ${sc.bank}` }],
        screenshot_jpeg_b64: null, callback_number: null, kill_chain_stage: hits.length ? 2 : 1,
        verdict: hits.length ? 'breaks' : 'suspicious',
        ai: { risk: 'scam', summary: 'Demo report: a message impersonating the bank that asks for something it never asks for.', reasons: hits.slice(0, 2).map((h) => h.id) },
      };
      const sealed = await sealB64(JSON.stringify(payload), box);
      const id = crypto.randomUUID();
      const sealedHash = sealedHashOf(await b64decode(sealed));
      const status = killedAt && at < killedAt ? 'blocked' : sc.dismiss && i < sc.dismiss ? 'dismissed' : i % 3 === 0 && at < NOW - 6 * HOUR ? 'opened' : 'delivered';
      const closedAt = status === 'blocked' ? killedAt : status === 'dismissed' ? at + int(15, 120) * MIN : undefined;
      const rep: StoredReport = {
        id, bank_id: sc.bank, channel: sc.channel, rules: hits.map((h) => h.id), severity, indicators: inds.map(({ x, n }) => ({ t: x.t, h: n.h })),
        hour: iso(at).slice(0, 13), sealed, sealed_hash: sealedHash, receipt_sig: await signHex(receiptMessage(id, sealedHash, iso(at)), receiptSk),
        ticket_hash: sha256Hex(hex(64)), received_at: iso(at), status, updated_at: iso(closedAt ?? at), ...(closedAt ? { closed_at: iso(closedAt) } : {}), demo: true,
      };
      await create(`reports/${id}.json`, rep);
      const { sealed: _s, receipt_sig: _r, ticket_hash: _t, indicators, ...rest } = rep;
      byBank.set(sc.bank, [...(byBank.get(sc.bank) ?? []), { ...rest, indicator_count: indicators.length, ih: [...new Set(indicators.map((x) => x.h))] }]);
      n++;
    }
    for (const { x, n: ind } of inds) {
      const cur = herd.get(ind.h);
      herd.set(ind.h, { t: x.t, reports: (cur?.reports ?? 0) + sc.reports, first: Math.min(cur?.first ?? first, first), daily: sc.daily, ...(killedAt ? { killedAt, by: sc.bank, label: maskedLabel(x.t, ind.canonical) } : cur?.killedAt ? { killedAt: cur.killedAt, by: cur.by, label: cur.label } : {}) });
      if (killedAt && !blocks.some((b) => b.h === ind.h)) blocks.push({ h: ind.h, t: x.t as BlockRow['t'], by: sc.bank, label: maskedLabel(x.t, ind.canonical), at: iso(killedAt), home: homeOf(x.t, x.v), demo: true });
    }
  }
  for (const [bank, rows] of byBank) {
    await update<ReportIndexRow[]>(`index/${bank}.json`, () => [], (cur) => [...rows, ...cur.filter((r) => !rows.some((x) => x.id === r.id))].sort((a, b) => b.received_at.localeCompare(a.received_at)).slice(0, 2000));
  }
  const byPrefix = new Map<string, string[]>();
  for (const h of herd.keys()) byPrefix.set(h.slice(0, 5), [...(byPrefix.get(h.slice(0, 5)) ?? []), h]);
  for (const [p, hs] of byPrefix) {
    await update<HerdFile>(herdPath(p), () => ({}), (f) => {
      const out = { ...f };
      for (const h of hs) {
        const e = herd.get(h)!;
        const days: Record<string, string[]> = {};
        for (let d = 7; d >= 0; d--) {
          const t = NOW - d * DAY;
          if (t < e.first - DAY) continue;
          days[dayOf(t)] = Array.from({ length: int(e.daily[0], e.daily[1]) }, () => hex(64));
        }
        out[h] = { t: e.t, days, reports: e.reports, confirmed_by: e.by ?? null, label: e.label ?? null };
      }
      return out;
    });
  }
  await update<BlockRow[]>('blocklist.json', () => [], (rows) => [...blocks.filter((b) => !rows.some((r) => r.h === b.h)), ...rows].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5000));
  // Every mule in lib/demo.ts must have been blocked by the bank it names.
  for (const [home, mules] of Object.entries(DEMO_MULES)) for (const m of mules) {
    const h = m.upi ? normalize('upi', m.upi).h : normalize('acct', `${m.acct![0]}/${m.acct![1]}`).h;
    const b = blocks.find((x) => x.h === h);
    if (!b || b.by !== m.by || b.home !== home) throw new Error(`demo mule ${m.upi ?? m.acct} is not blocked by ${m.by} for ${home}`);
  }
  console.log(`\n${n} reports, ${herd.size} herd values, ${blocks.length} blocks (mule alerts: ${blocks.filter((b) => b.home && b.home !== b.by).length})`);
}

// ---------------------------------------------------------------- Acme (Pay Check)

const ACME_RULES: PayRulesDoc = {
  threshold_inr: 100_000,
  allowed_channels: ['email', 'in_person'],
  vendors: [
    { vendor_name: 'Sharma Traders', account: '50100987654321', ifsc: 'HDFC0001234' },
    { vendor_name: 'Shree Balaji Logistics', account: '920020045671234', ifsc: 'UTIB0000123' },
    { vendor_name: 'Kaveri Packaging', account: '30451234567', ifsc: 'SBIN0001234' },
  ].map((v, i) => ({ id: `demo-vendor-${i + 1}`, vendor_name: v.vendor_name, acct_hash: normalize('acct', `${v.account}/${v.ifsc}`).h, acct_hint: v.account.slice(-4) })),
  approvers: [
    { id: 'demo-approver-1', name: 'R. Mehta', role: 'CFO', callback_phone: '+91 98200 11010', max_amount_inr: 500_000 },
    { id: 'demo-approver-2', name: 'A. Verma', role: 'Accounts Manager', callback_phone: '+91 97300 22022', max_amount_inr: 100_000 },
  ],
  updated_at: iso(NOW - 8 * DAY),
  updated_by: DEMO_USER,
};

const ACME_HISTORY: { daysAgo: number; requester: string; channel: string; text: string; summary: string; flags: [string, string, string][]; verify?: 'confirmed' | 'denied' }[] = [
  { daysAgo: 6, requester: 'A. Verma', channel: 'email', text: 'Please release Rs 45,000 to Sharma Traders a/c 50100987654321 IFSC HDFC0001234 for invoice 7781.', summary: '₹45,000 to Sharma Traders', flags: [] },
  { daysAgo: 4, requester: 'A. Verma', channel: 'email', text: 'Pay Rs 2,40,000 to Sharma Traders a/c 50100987654321 IFSC HDFC0001234.', summary: '₹2.4 lakh to Sharma Traders',
    flags: [['APPROVER_LIMIT', 'high', 'The amount is above what this approver may authorise.'], ['OVER_LIMIT', 'medium', 'The amount is above the company threshold for a callback.']], verify: 'confirmed' },
  { daysAgo: 2, requester: 'R. Mehta', channel: 'whatsapp', text: 'Mehta here, in a board meeting. Send Rs 3,75,000 to refund.desk@okhdfcbank right away for the customs clearance. Keep it confidential, do not tell anyone.', summary: '₹3.75 lakh to UPI refund.desk@okhdfcbank',
    flags: [['NETWORK_BLOCKED', 'critical', 'A bank on SATYA has confirmed this account or UPI ID as fake.'], ['NO_ACCOUNT_FOUND', 'info', 'No account number was found in the request.'], ['OVER_LIMIT', 'medium', 'The amount is above the company threshold for a callback.'], ['URGENT_SECRET', 'high', 'The request is both urgent and secret, the classic CEO-fraud pressure.'], ['WRONG_CHANNEL', 'high', 'Payment requests are not accepted over this channel.']], verify: 'denied' },
  { daysAgo: 1, requester: 'R. Mehta', channel: 'email', text: 'Our vendor changed banks. Transfer Rs 8,40,000 today to a/c 777705551234 IFSC ICIC0000999 for the steel order.', summary: '₹8.4 lakh to a/c ••••1234 (ICIC0000999)',
    flags: [['APPROVER_LIMIT', 'high', 'The amount is above what this approver may authorise.'], ['NEW_ACCOUNT', 'critical', 'The account and IFSC in the request do not match any saved vendor.'], ['OVER_LIMIT', 'medium', 'The amount is above the company threshold for a callback.']], verify: 'denied' },
];

async function seedAcme() {
  await update<PayRulesDoc>('pay/ACME/rules.json', () => ACME_RULES, (cur) => (cur.updated_by && cur.updated_by !== DEMO_USER && cur.vendors.length ? cur : ACME_RULES));
  const recs: PayCheckRecord[] = [];
  for (const h of ACME_HISTORY) {
    const at = NOW - h.daysAgo * DAY - int(1, 5) * HOUR;
    const id = crypto.randomUUID();
    const requestHash = sha256Hex(h.text);
    const initial = h.flags.some(([, s]) => s === 'critical' || s === 'high') ? 'hold' : 'clear';
    const decision = h.verify ? (h.verify === 'confirmed' ? 'released' : 'blocked') : initial;
    const decidedAt = iso(h.verify ? at + int(8, 40) * MIN : at);
    const receipt = (await signPayReceipt(id, requestHash, decision, decidedAt))!;
    const approver = ACME_RULES.approvers.find((a) => a.name === h.requester)!;
    recs.push({
      id, created_at: iso(at), created_by: 'Neha Kulkarni', requester: h.requester, channel: h.channel, amount_inr: amounts(h.text), request_hash: requestHash, summary: h.summary,
      flags: h.flags.map(([flag, severity, reason]) => ({ flag, severity, reason })), voice_score: null, initial, decision, receipt,
      ...(h.verify ? { verify: { result: h.verify, by: 'Neha Kulkarni', at: decidedAt, callback_phone: approver.callback_phone } } : {}), demo: true,
    });
  }
  await update<PayCheckRecord[]>('pay/ACME/checks.json', () => [], (cur) => [...recs, ...cur.filter((r) => !r.demo)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  console.log(`Acme: ${ACME_RULES.vendors.length} vendors, ${ACME_RULES.approvers.length} approvers, ${recs.length} past decisions`);
}

// ---------------------------------------------------------------- clean

async function clean() {
  let reports = 0;
  for (const b of BUNDLE.banks) {
    const rows = (await readJson<ReportIndexRow[]>(`index/${b.bank_id}.json`)) ?? [];
    const demo = rows.filter((r) => r.demo);
    for (const r of demo) await remove(`reports/${r.id}.json`);
    if (demo.length) await update<ReportIndexRow[]>(`index/${b.bank_id}.json`, () => [], (cur) => cur.filter((r) => !r.demo));
    if ((await readJson(`mules/${b.bank_id}.json`))) {
      const hs = new Set(demoHashes());
      await update<Record<string, unknown>>(`mules/${b.bank_id}.json`, () => ({}), (m) => Object.fromEntries(Object.entries(m).filter(([h]) => !hs.has(h))));
    }
    reports += demo.length;
  }
  const blocks = await removeFromBlocklist((r) => Boolean(r.demo));
  await herdForget(demoHashes());
  const checks = await listPayChecks('ACME');
  if (checks.some((c) => c.demo)) await update<PayCheckRecord[]>('pay/ACME/checks.json', () => [], (cur) => cur.filter((c) => !c.demo));
  const rules = await readJson<PayRulesDoc>('pay/ACME/rules.json');
  if (rules?.updated_by === DEMO_USER) await remove('pay/ACME/rules.json');
  console.log(`clean: ${reports} demo reports, ${blocks.length} demo blocks, ${checks.filter((c) => c.demo).length} demo pay checks removed`);
}

/** Removes what scripts/smoke.ts left behind before it cleaned up after itself (source_app "smoke"). */
async function cleanSmoke() {
  const keys = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'keys', 'demo_keys.json'), 'utf8'));
  const hashes = new Set<string>();
  let n = 0;
  for (const row of await listReports('SBI')) {
    if (row.demo) continue;
    const r = await getReport(row.id);
    if (!r) continue;
    const text = await openSealedB64Text(r.sealed, keys.SBI.box.pk, keys.SBI.box.sk).catch(() => null);
    if (!text || JSON.parse(text).source_app !== 'smoke') continue;
    r.indicators.forEach((i) => hashes.add(i.h));
    await remove(`reports/${r.id}.json`);
    await update<ReportIndexRow[]>('index/SBI.json', () => [], (cur) => cur.filter((x) => x.id !== r.id));
    n++;
  }
  const gone = await removeFromBlocklist((b) => b.label.startsWith('UPI smoke'));
  gone.forEach((b) => hashes.add(b.h));
  await herdForget([...hashes]);
  console.log(`clean-smoke: ${n} smoke reports, ${gone.length} smoke blocks, ${hashes.size} herd values removed`);
}

const cmd = process.argv[2];
console.log(`store namespace: "${process.env.SATYA_STORE_PREFIX ?? ''}" (empty = production)\n`);
if (cmd === 'seed') {
  await clean();
  await seedReports();
  await seedAcme();
  for (const b of [...BUNDLE.banks.map((x) => x.bank_id), 'ACME']) await logAction(b, DEMO_USER, 'demo_seeded', undefined, 'demo reports, blocks and herd counts');
  const total = (await getBlocklist()).length;
  console.log(`blocklist now ${total} rows`);
} else if (cmd === 'plan') {
  for (const sc of SCENARIOS) {
    const ev = evaluate(RULE_BOOK, { text: sc.text, channel: sc.channel, sender: sc.senders[0] });
    console.log(`${sc.bank.padEnd(5)} ${String(sc.reports).padStart(2)}× ${sc.channel.padEnd(8)} claims ${String(ev.bank).padEnd(5)} ${ev.hits.map((h) => h.join(':')).join(' ') || 'AI only'}`);
  }
} else if (cmd === 'clean') {
  await clean();
} else if (cmd === 'clean-smoke') {
  await cleanSmoke();
} else {
  console.log('usage: demo-data.ts seed | clean | clean-smoke | plan');
  process.exit(1);
}
