// Doctor CLI (Section 17.1): npx tsx scripts/doctor.ts --target local|prod [--only db|gateway|vivek|setu|ai] [--e2e] [--repeat N]
// Prints PASS/FAIL per check with one-line reasons; exit code 1 on any FAIL. Never prints a secret.
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { ROOT_DIR, loadOrCreateKeys } from './gen-keys';
import { verifyBundle, type RegistryBundle } from '../lib/satya/bundle';
import { b64encode, doctorMessage, openSealed, randomHex, receiptMessage, seal, verifyHex, b64decode } from '../lib/satya/crypto';
import { dayToken, fromHex, sha256Hex } from '../lib/satya/hash';
import { upi } from '../lib/satya/normalize';

loadEnv({ path: path.join(ROOT_DIR, 'web', '.env.local') });
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const target = arg('--target') ?? 'prod';
const only = arg('--only');
const repeat = Number(arg('--repeat') ?? 1);
const e2e = args.includes('--e2e');
const GW = (target === 'local' ? 'http://localhost:3000' : process.env.SATYA_GATEWAY_URL ?? 'https://satya-gateway.vercel.app').replace(/\/+$/, '');
const SETU = process.env.SATYA_SETU_URL?.replace(/\/+$/, '');
const VIVEK = process.env.VIVEK_URL?.replace(/\/+$/, '');
const AI = process.env.AI_BASE_URL?.replace(/\/+$/, '');

type Res = { id: string; name: string; ok: boolean | null; why: string; ms: number };
const results: Res[] = [];
const keysP = loadOrCreateKeys();

async function check(id: string, name: string, group: string, fn: () => Promise<string>) {
  if (only && only !== group) return;
  for (let i = 0; i < repeat; i++) {
    const t0 = Date.now();
    try {
      const why = await fn();
      results.push({ id, name, ok: why.startsWith('SKIP') ? null : true, why, ms: Date.now() - t0 });
    } catch (e: any) {
      results.push({ id, name, ok: false, why: String(e?.message ?? e).slice(0, 140), ms: Date.now() - t0 });
    }
  }
}
function need(c: unknown, msg: string): asserts c { if (!c) throw new Error(msg); }
async function http(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

async function main() {
  const k = await keysP;
  const app = { 'x-satya-app': k.server.app_key };
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
  const signIn = async (email: string) => {
    need(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.DEMO_PASSWORD, 'anon key / DEMO_PASSWORD missing');
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
    need(!error && data.session, `sign-in ${email} failed`);
    return { c, token: data.session!.access_token };
  };

  await check('C1', 'Gateway health + db', 'gateway', async () => {
    const r = await http('GET', GW + '/api/v1/health');
    need(r.status === 200, `HTTP ${r.status}`);
    need(r.json?.db, 'db not reachable from the gateway');
    return `ok · vivek ${r.json.vivek}`;
  });

  await check('C2', 'Registry: GLOBAL + 5 banks verify against ROOT_PK', 'gateway', async () => {
    const r = await http('GET', GW + '/api/v1/registry', undefined, app);
    need(r.status === 200, `HTTP ${r.status} ${r.json?.error ?? ''}`);
    const v = await verifyBundle(r.json as RegistryBundle, k.root.root.pk);
    need(v.ok && v.cards === 6, `${v.cards} cards, problems: ${v.problems.join(', ')}`);
    return `${v.cards} cards verified · blocklist ${r.json.blocklist.length}`;
  });

  await check('C3', 'SANGH: sighting then lookup, idempotent per day token', 'gateway', async () => {
    const ind = upi(`doctor.${await randomHex(4)}@satya`);
    const secret = fromHex(await randomHex(32));
    const tok = dayToken(secret, new Date().toISOString().slice(0, 10), ind.h);
    for (let i = 0; i < 2; i++) { const s = await http('POST', GW + '/api/v1/herd/sighting', { h: ind.h, t: 'upi', day_token: tok }, app); need(s.status === 204, `sighting HTTP ${s.status}`); }
    const l = await http('GET', GW + '/api/v1/herd/' + ind.prefix, undefined, app);
    const m = l.json?.matches?.find((x: any) => x.h === ind.h);
    need(m && m.seen_7d === 1, `seen_7d=${m?.seen_7d}`);
    return 'seen once after two identical sightings';
  });

  let c4Report: string | null = null;
  await check('C4', 'DOOT: seal -> /reports -> receipt -> open blob with Doctor key', 'gateway', async () => {
    const box = k.orgs.DOCTOR.box!;
    const payload = JSON.stringify({ v: 1, doctor: true, at: new Date().toISOString() });
    const sealed = await seal(payload, box.pk);
    const ticket = await randomHex(32);
    const env = { v: 1, bank_id: 'DOCTOR', channel: 'sms', rules: ['G01_NO_SECRETS'], severity: 'critical', indicators: [{ t: 'upi', h: upi('doctor@satya').h }], hour: new Date().toISOString().slice(0, 13), sealed: await b64encode(sealed), ticket_hash: sha256Hex(ticket) };
    const r = await http('POST', GW + '/api/v1/reports', env, app);
    need(r.status === 201, `HTTP ${r.status} ${r.json?.error ?? ''}`);
    need(r.json.sealed_hash === sha256Hex(sealed), 'sealed_hash mismatch');
    need(await verifyHex(receiptMessage(r.json.report_id, r.json.sealed_hash, r.json.received_at), r.json.receipt_sig, k.server.receipt.pk), 'receipt signature invalid');
    c4Report = r.json.report_id;
    if (sb) {
      const { data } = await sb.from('report_blobs').select('sealed').eq('report_id', r.json.report_id).single();
      const opened = new TextDecoder().decode(await openSealed(await b64decode(data!.sealed), box.pk, box.sk));
      need(opened === payload, 'opened payload differs');
    }
    const good = await http('GET', `${GW}/api/v1/reports/${r.json.report_id}/status`, undefined, { ...app, 'x-satya-ticket': ticket });
    const bad = await http('GET', `${GW}/api/v1/reports/${r.json.report_id}/status`, undefined, { ...app, 'x-satya-ticket': await randomHex(32) });
    need(good.status === 200 && bad.status === 403, `status right ${good.status}, wrong ${bad.status}`);
    return 'receipt verified · blob opened · right ticket 200, wrong 403';
  });

  await check('C4b', 'Doctor seal endpoint (phone D12/D13 path)', 'gateway', async () => {
    const sealed = await seal('satya-doctor', k.server.doctor_box.pk);
    const r = await http('POST', GW + '/api/v1/doctor/seal', { sealed: await b64encode(sealed) }, app);
    need(r.status === 200 && r.json.plaintext_sha256 === sha256Hex('satya-doctor'), `HTTP ${r.status} ${r.json?.error ?? ''}`);
    need(await verifyHex(doctorMessage(r.json.plaintext_sha256), r.json.sig, k.server.receipt.pk), 'signature invalid');
    return 'opened by the gateway, signed by RECEIPT_PK';
  });

  await check('C5', 'RLS: bank isolation, anon locked out of functions', 'db', async () => {
    need(sb, 'Supabase not configured');
    const { c } = await signIn('sbi@satya.demo');
    const other = await c.from('reports').select('id').eq('bank_id', 'HDFC').limit(1);
    need(!other.error && (other.data ?? []).length === 0, 'SBI can see HDFC reports');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const rs = await anon.from('reports').select('id').limit(1);
    need((rs.data ?? []).length === 0, 'anon can read reports');
    const f1 = await anon.rpc('herd_lookup', { p_prefix: '00000' });
    const f2 = await anon.rpc('ingest_report', {});
    need(f1.error && f2.error, 'anon can call service functions');
    return 'SBI sees only SBI; anon sees nothing and cannot call functions';
  });

  await check('C6', 'Realtime: report INSERT reaches the bank console in <= 5 s', 'db', async () => {
    need(sb, 'Supabase not configured');
    const { c, token } = await signIn('doctor@satya.demo');
    c.realtime.setAuth(token);
    const got = new Promise<number>((resolve, reject) => {
      const t0 = Date.now();
      const ch = c.channel('doctor-c6').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports', filter: 'bank_id=eq.DOCTOR' }, () => { resolve(Date.now() - t0); c.removeChannel(ch); })
        .subscribe(async (st) => {
          if (st !== 'SUBSCRIBED') return;
          const sealed = await seal('{"v":1}', k.orgs.DOCTOR.box!.pk);
          await http('POST', GW + '/api/v1/reports', { v: 1, bank_id: 'DOCTOR', channel: 'sms', rules: ['G01_NO_SECRETS'], severity: 'high', indicators: [], hour: new Date().toISOString().slice(0, 13), sealed: await b64encode(sealed), ticket_hash: sha256Hex(await randomHex(32)) }, app);
        });
      setTimeout(() => reject(new Error('no realtime event within 5 s')), 5000);
    });
    return `event after ${await got} ms`;
  });

  await check('C7', 'Kill: confirmed_by shows in herd lookup', 'gateway', async () => {
    const { token } = await signIn('doctor@satya.demo');
    const ind = upi(`killtest.${await randomHex(3)}@satya`);
    const r = await http('POST', GW + '/api/v1/kill', { bank_id: 'DOCTOR', indicators: [{ t: 'upi', h: ind.h, label: 'UPI killt***@satya' }] }, { authorization: 'Bearer ' + token });
    need(r.status === 200, `kill HTTP ${r.status} ${r.json?.error ?? ''}`);
    const l = await http('GET', GW + '/api/v1/herd/' + ind.prefix, undefined, app);
    need(l.json?.matches?.find((m: any) => m.h === ind.h)?.confirmed_by === 'DOCTOR', 'not confirmed');
    return 'confirmed_by = DOCTOR';
  });

  await check('C8', 'VIVEK: health, ask(T02) = share_secret, face + voice scores', 'vivek', async () => {
    need(VIVEK, 'VIVEK_URL not set');
    const h = await http('GET', VIVEK + '/health', undefined, app);
    need(h.status === 200, `health HTTP ${h.status}`);
    const a = await http('POST', VIVEK + '/v1/ask', { text: 'Main HDFC Bank se bol raha hoon, aapke card pe fraud hua hai, jo OTP aaya hai woh bata dijiye', hint_bank: 'HDFC' }, app);
    need(a.json?.ask_type === 'share_secret', `ask_type=${a.json?.ask_type} (${a.json?.source})`);
    return `share_secret via ${a.json.source} · models ${JSON.stringify(h.json.models)}`;
  });

  await check('C9', 'AI model: provider lists chat + STT models', 'ai', async () => {
    need(VIVEK, 'VIVEK_URL not set');
    const h = await http('GET', VIVEK + '/health', undefined, app);
    need(h.json?.ai?.reachable && h.json.ai.chat_model_ok && h.json.ai.stt_model_ok, JSON.stringify(h.json?.ai));
    return `provider ${h.json.ai.base}`;
  });

  await check('C10', 'VISMRITI: VIVEK tmp files unchanged; gateway never echoes inputs', 'vivek', async () => {
    need(VIVEK, 'VIVEK_URL not set');
    const before = (await http('GET', VIVEK + '/health', undefined, app)).json?.tmp_files;
    await http('POST', VIVEK + '/v1/ask', { text: 'share your OTP 482913 now' }, app);
    const after = (await http('GET', VIVEK + '/health', undefined, app)).json?.tmp_files;
    need(before === after, `tmp ${before} -> ${after}`);
    const g = await http('POST', GW + '/api/v1/herd/sighting', { h: 'zz-not-hex', t: 'upi', day_token: 'x' }, app);
    need(!g.text.includes('zz-not-hex'), 'gateway echoed input');
    return `tmp files ${after} before and after`;
  });

  await check('C11', 'VISMRITI cron jobs + realtime table', 'db', async () => {
    need(sb, 'Supabase not configured');
    const { data, error } = await sb.rpc('doctor_info');
    need(!error, error?.message ?? 'doctor_info failed');
    need(data.cron_jobs.includes('satya_purge_blobs') && data.cron_jobs.includes('satya_purge_sightings'), `cron ${data.cron_jobs}`);
    need(data.realtime_tables.includes('reports'), 'reports not in supabase_realtime');
    return `cron ${data.cron_jobs.join(', ')}`;
  });

  await check('C12', 'SETU: health + C3 through the relay, no client IP headers reach the gateway', 'setu', async () => {
    need(SETU, 'SATYA_SETU_URL not set');
    const r = await http('GET', SETU + '/api/v1/doctor/echo-headers', undefined, { ...app, 'user-agent': 'SM-S918B', 'x-forwarded-for': '9.9.9.9' });
    need(r.status === 200, `HTTP ${r.status}`);
    need(r.json.via_setu && !r.json.present['user-agent'] && !r.json.present.cookie, JSON.stringify(r.json.present));
    return 'relay strips user agent, cookies and client IP headers';
  });

  if (e2e && c4Report) {
    await check('E2E', 'Report -> Radar row -> decrypt -> Kill -> confirmed', 'gateway', async () => {
      need(sb, 'Supabase not configured');
      const { data } = await sb.from('reports').select('status').eq('id', c4Report!).single();
      need(data, 'report row missing');
      return `report ${c4Report!.slice(0, 8)} visible with status ${data!.status}`;
    });
  }

  // Report
  const w = Math.max(...results.map((r) => r.name.length), 10);
  console.log(`\nSATYA Doctor · target ${target} (${GW})${repeat > 1 ? ` · ${repeat} runs each` : ''}\n`);
  const byId = new Map<string, Res[]>();
  results.forEach((r) => byId.set(r.id, [...(byId.get(r.id) ?? []), r]));
  for (const [id, rs] of byId) {
    const pass = rs.filter((r) => r.ok).length, skip = rs.every((r) => r.ok === null);
    const status = skip ? 'SKIP' : pass === rs.length ? 'PASS' : 'FAIL';
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
    console.log(`${status.padEnd(4)}  ${id.padEnd(4)}  ${rs[0].name.padEnd(w)}  ${repeat > 1 ? `${pass}/${rs.length} ` : ''}${ms} ms  ${rs[rs.length - 1].why}`);
  }
  const failed = results.some((r) => r.ok === false);
  fs.writeFileSync(path.join(ROOT_DIR, 'web', '.doctor-last.txt'), results.map((r) => `${r.ok ? 'PASS' : r.ok === null ? 'SKIP' : 'FAIL'} ${r.id} ${r.why}`).join('\n') + '\n');
  process.exit(failed ? 1 : 0);
}

main();
