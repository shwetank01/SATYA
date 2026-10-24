// Seed (Section 12.7). Idempotent: run it as often as you like.
//   npx tsx scripts/seed.ts            (needs web/.env.local with Supabase URL + service role key + DEMO_PASSWORD)
// 1. keys (root / server / demo orgs)   2. orgs + certificates   3. Promise Cards (GLOBAL + 5 banks)
// 4. console users + memberships        5. ACME pay rules        6. 20 seeded reports in 3 campaigns
// 7. keys/demo_keys.json + Android first-run asset (same builder as /api/v1/registry)
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { BANKS, ROOT_DIR, loadOrCreateKeys, writeEnvFiles } from './gen-keys';
import { bundleFromRegistry } from './build-bundle';
import { buildBundle, verifyBundle } from '../lib/satya/bundle';
import { b64encode, certMessage, randomHex, receiptMessage, seal, sealedHashOf, signHex } from '../lib/satya/crypto';
import { sha256Hex, ticketHash } from '../lib/satya/hash';
import { acct, host, tel, upi, type Indicator } from '../lib/satya/normalize';
import { mask } from '../lib/satya/mask';

loadEnv({ path: path.join(ROOT_DIR, 'web', '.env.local') });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !service || !password) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or DEMO_PASSWORD in web/.env.local');
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r: { data: any; error: any }, what: string): any => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const NAMES: Record<string, string> = { SBI: 'State Bank of India', HDFC: 'HDFC Bank', ICICI: 'ICICI Bank', AXIS: 'Axis Bank', PNB: 'Punjab National Bank', DOCTOR: 'SATYA Doctor (test bank)', ACME: 'Acme Components Pvt Ltd' };

async function main() {
  const { registry, keys, globalCard, banks } = await bundleFromRegistry();
  const rootSk = keys.root.root.sk;
  writeEnvFiles(keys, { NEXT_PUBLIC_SUPABASE_URL: url!, NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', SUPABASE_SERVICE_ROLE_KEY: service!, DEMO_PASSWORD: password! });

  // 2. Orgs with Root-signed certificates.
  const orgRows = [];
  for (const id of [...BANKS, 'DOCTOR']) {
    const k = keys.orgs[id];
    const boxPk = k.box?.pk ?? null;
    orgRows.push({ id, name: NAMES[id], type: 'bank', sign_pk: k.sign.pk, box_pk: boxPk, cert_sig: await signHex(certMessage(id, k.sign.pk, boxPk), rootSk) });
  }
  orgRows.push({ id: 'ACME', name: NAMES.ACME, type: 'company', sign_pk: null, box_pk: null, cert_sig: null });
  must(await db.from('orgs').upsert(orgRows), 'orgs');

  // 3. Promise Cards, signed by SATYA Root (banks can re-sign from the console later).
  const cardRows = [{ org_id: 'GLOBAL', card_json: globalCard.card_json, sig: globalCard.sig, signed_by: 'satya_root', version: 1 }];
  for (const b of banks) cardRows.push({ org_id: b.bank_id, card_json: b.card.card_json, sig: b.card.sig, signed_by: 'satya_root', version: 1 });
  // Keep a bank-published card (version > 1) if one exists: the seed never overwrites a bank's own card.
  const existing = must(await db.from('promise_cards').select('org_id,version,signed_by'), 'cards read') as any[];
  const keep = new Set(existing.filter((c) => c.signed_by === 'bank').map((c) => c.org_id));
  must(await db.from('promise_cards').upsert(cardRows.filter((c) => !keep.has(c.org_id))), 'cards');

  // 4. Console users + memberships.
  const users = must(await db.auth.admin.listUsers({ page: 1, perPage: 200 }), 'list users') as any;
  const byEmail = new Map<string, string>((users.users ?? []).map((u: any) => [u.email, u.id]));
  const members: { user_id: string; org_id: string }[] = [];
  for (const org of [...BANKS, 'DOCTOR', 'ACME']) {
    const email = `${org.toLowerCase()}@satya.demo`;
    let id = byEmail.get(email);
    if (!id) {
      const r = must(await db.auth.admin.createUser({ email, password: password!, email_confirm: true }), `create ${email}`) as any;
      id = r.user.id;
    } else {
      must(await db.auth.admin.updateUserById(id, { password: password! }), `password ${email}`);
    }
    members.push({ user_id: id!, org_id: org });
  }
  must(await db.from('members').upsert(members), 'members');

  // 5. ACME pay rules from Appendix E (accounts hashed; only the last 4 digits kept as a hint).
  const pc = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'spec', 'paycheck_cases.json'), 'utf8'));
  must(await db.from('pay_rules').upsert({ org_id: 'ACME', threshold_inr: pc.rules.threshold_inr, allowed_channels: pc.rules.allowed_channels }), 'pay_rules');
  must(await db.from('pay_vendors').delete().eq('org_id', 'ACME'), 'vendors clear');
  must(await db.from('pay_vendors').insert(pc.rules.vendors.map((v: any) => ({ org_id: 'ACME', vendor_name: v.vendor_name, acct_hash: acct(v.account, v.ifsc).h, acct_hint: v.account.slice(-4) }))), 'vendors');
  must(await db.from('pay_approvers').delete().eq('org_id', 'ACME'), 'approvers clear');
  must(await db.from('pay_approvers').insert(pc.rules.approvers.map((a: any) => ({ org_id: 'ACME', ...a }))), 'approvers');

  // 6. 20 seeded reports, 3 campaigns, last 7 days, sealed to each bank's real box key.
  must(await db.from('reports').delete().eq('seeded', true), 'seeded clear');
  const campaigns: { bank: string; channel: string; text: string; sender: string; rules: string[]; severity: string; inds: { i: Indicator; value: string }[] }[] = [
    { bank: 'SBI', channel: 'whatsapp', sender: '+91 70448 21319', severity: 'high', rules: ['G03_SERVICE_CALLS_1600', 'G08_NO_KYC_FEE'],
      text: 'Dear customer, your YONO account will be blocked today because your KYC is pending. Pay Rs 10 KYC fee to sbi.kyc@ybl to keep your account active.',
      inds: [{ i: upi('sbi.kyc@ybl'), value: 'sbi.kyc@ybl' }, { i: tel('+91 70448 21319'), value: '+91 70448 21319' }] },
    { bank: 'SBI', channel: 'sms', sender: '+91 98123 40021', severity: 'critical', rules: ['G02_LINK_BANK_IN', 'G05_SMS_FROM_HEADER_NOT_NUMBER', 'SBI01_NO_KYC_LINKS'],
      text: 'Dear SBI customer your YONO will be blocked today. Update PAN KYC: sbi-kyc-update.in/verify',
      inds: [{ i: host('sbi-kyc-update.in'), value: 'sbi-kyc-update.in' }] },
    { bank: 'HDFC', channel: 'call', sender: '+91 70123 45645', severity: 'critical', rules: ['G01_NO_SECRETS', 'G03_SERVICE_CALLS_1600'],
      text: 'Main HDFC Bank se bol raha hoon, aapke card pe fraud hua hai, jo OTP aaya hai woh bata dijiye',
      inds: [{ i: tel('+91 70123 45645'), value: '+91 70123 45645' }] },
  ];
  const plan = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 0, 1, 2, 0];
  const extra = [{ bank: 'ICICI', c: 0 }, { bank: 'AXIS', c: 1 }, { bank: 'PNB', c: 2 }];
  const sevenDays = 7 * 86400_000;
  let n = 0;
  for (let k = 0; k < 20; k++) {
    const base = campaigns[plan[k]];
    const bank = k >= 17 ? extra[k - 17].bank : base.bank;
    const boxPk = keys.orgs[bank].box!.pk;
    const when = new Date(Date.now() - Math.floor((sevenDays * (19 - k)) / 20) - 3_600_000 * (k % 5));
    const payload = JSON.stringify({
      v: 1, created_at: when.toISOString(), source_app: base.channel === 'sms' ? 'com.samsung.android.messaging' : base.channel === 'whatsapp' ? 'com.whatsapp' : 'com.samsung.android.incallui',
      channel: base.channel, claimed_bank: bank, sender: base.sender, masked_text: mask(base.text.replace('Dear customer', 'Dear Ramesh'), ['Ramesh']),
      raw_indicators: base.inds.map((x) => ({ t: x.i.t, value: x.value })),
      rule_hits: base.rules.map((id) => ({ id, severity: id.startsWith('G01') || id.startsWith('SBI01') ? 'critical' : 'high', promise: '', issuer: id.startsWith('G') ? 'GLOBAL' : bank, source: '', ai_assisted: false })),
      scores: { face: null, voice: null }, herd: { seen_7d: 3 + k, reports: Math.floor(k / 3) },
      timeline: [{ t: when.toISOString(), event: `${base.channel} from ${base.sender}` }], screenshot_jpeg_b64: null, callback_number: null, seeded: true,
    });
    const sealed = await seal(payload, boxPk);
    const sealedHash = sealedHashOf(sealed);
    const id = crypto.randomUUID();
    const receivedAt = new Date(when.getTime() + 90_000).toISOString();
    must(await db.rpc('ingest_report', {
      p_id: id, p_bank: bank, p_channel: base.channel, p_rules: base.rules, p_severity: base.severity,
      p_hashes: base.inds.map((x) => x.i.h), p_types: base.inds.map((x) => x.i.t),
      p_hour: when.toISOString().slice(0, 13), p_sealed: await b64encode(sealed), p_sealed_hash: sealedHash,
      p_receipt: await signHex(receiptMessage(id, sealedHash, receivedAt), keys.server.receipt.sk),
      p_ticket_hash: ticketHash(await randomHex(32)), p_received_at: receivedAt, p_seeded: true,
    }), `report ${k}`);
    n++;
  }

  // 7. Android asset from the same builder, verified before it is written.
  const bundle = await buildBundle({ globalCard, banks, blocklist: [] });
  const v = await verifyBundle(bundle, keys.root.root.pk);
  if (!v.ok) throw new Error('bundle does not verify: ' + v.problems.join(', '));
  fs.writeFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'registry_bundle.json'), JSON.stringify(bundle, null, 1) + '\n');
  console.log(`seed OK: ${orgRows.length} orgs, ${cardRows.length} cards (${v.cards} verify against Root), ${members.length} users, ${n} seeded reports`);
  console.log(`console logins: <bank>@satya.demo / DEMO_PASSWORD (in web/.env.local)`);
  void sha256Hex; void registry;
}

main().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
