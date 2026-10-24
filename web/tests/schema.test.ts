// Runs supabase/schema.sql on PGlite (Postgres in WASM) with a small stub of Supabase's auth schema,
// then exercises the functions the gateway relies on: ingest_report, herd_sight/herd_lookup,
// kill_indicators, and the RLS rules Doctor C5 checks in the real project.
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const SQL = fs.readFileSync(path.resolve(__dirname, '..', '..', 'supabase', 'schema.sql'), 'utf8');
const H = (c: string) => c.repeat(64);
let db: PGlite;

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
`;

async function asUser(uid: string | null, fn: () => Promise<void>) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try { await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

const ingest = (id: string, bank: string, hashes: string[], types: string[]) =>
  db.query(`select public.ingest_report($1,$2,'sms',array['G01_NO_SECRETS'],'critical',$3,$4,'2026-10-24T11','c2VhbGVk',$5,'sig',$6,now(),false)`,
    [id, bank, hashes, types, H('a'), H('b')]);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  await db.exec(SQL);
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select on all tables in schema public to anon, authenticated;
    grant insert, update, delete on public.pay_rules, public.pay_vendors, public.pay_approvers, public.pay_checks to authenticated;
    insert into public.orgs (id, name, type, box_pk) values ('SBI','State Bank of India','bank','${H('1')}'), ('HDFC','HDFC Bank','bank','${H('2')}'), ('ACME','Acme','company', null);
    insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    insert into public.members values ('00000000-0000-0000-0000-000000000001','SBI'), ('00000000-0000-0000-0000-000000000002','ACME');
  `);
}, 60_000);

describe('schema.sql on Postgres', () => {
  it('ingest_report stores the report, the blob and counts indicators atomically', async () => {
    await ingest('11111111-1111-1111-1111-111111111111', 'SBI', [H('c'), H('d')], ['upi', 'host']);
    await ingest('22222222-2222-2222-2222-222222222222', 'SBI', [H('c')], ['upi']);
    const r = await db.query<{ reports: number }>(`select reports from public.indicators where hash = $1`, [H('c')]);
    expect(r.rows[0].reports).toBe(2);
    const b = await db.query(`select count(*)::int n from public.report_blobs`);
    expect((b.rows[0] as any).n).toBe(2);
  });

  it('ingest_report rejects mismatched hashes/types', async () => {
    await expect(ingest('33333333-3333-3333-3333-333333333333', 'SBI', [H('e')], [])).rejects.toThrow(/mismatch/);
  });

  it('herd_sight is idempotent per day token and herd_lookup finds by prefix', async () => {
    await db.query(`select public.herd_sight($1,'tel',$2)`, [H('f'), H('9')]);
    await db.query(`select public.herd_sight($1,'tel',$2)`, [H('f'), H('9')]);
    await db.query(`select public.herd_sight($1,'tel',$2)`, [H('f'), H('8')]);
    const r = await db.query<any>(`select * from public.herd_lookup('fffff')`);
    expect(r.rows).toHaveLength(1);
    expect(Number(r.rows[0].seen_7d)).toBe(2);
    const bad = await db.query<any>(`select * from public.herd_lookup('x''; drop table reports; --')`);
    expect(bad.rows).toHaveLength(0);
  });

  it('kill_indicators confirms, labels and blocks matching reports of that bank only', async () => {
    const r = await db.query<any>(`select public.kill_indicators('SBI', array[$1], array['upi'], array['UPI sbi.k***@ybl']) n`, [H('c')]);
    expect(r.rows[0].n).toBe(2);
    const i = await db.query<any>(`select confirmed_by, label from public.indicators where hash = $1`, [H('c')]);
    expect(i.rows[0]).toEqual({ confirmed_by: 'SBI', label: 'UPI sbi.k***@ybl' });
    const lk = await db.query<any>(`select confirmed_by from public.herd_lookup('ccccc')`);
    expect(lk.rows[0].confirmed_by).toBe('SBI');
    const st = await db.query<any>(`select distinct status from public.reports where bank_id = 'SBI'`);
    expect(st.rows.map((x: any) => x.status)).toEqual(['blocked']);
  });

  it('RLS: a bank member sees only its own reports; anon sees nothing', async () => {
    await ingest('44444444-4444-4444-4444-444444444444', 'HDFC', [], []);
    await asUser('00000000-0000-0000-0000-000000000001', async () => {
      const r = await db.query<any>(`select bank_id from public.reports`);
      expect(new Set(r.rows.map((x: any) => x.bank_id))).toEqual(new Set(['SBI']));
      const blobs = await db.query<any>(`select bank_id from public.report_blobs`);
      expect(blobs.rows.every((x: any) => x.bank_id === 'SBI')).toBe(true);
      const ind = await db.query<any>(`select * from public.indicators`);
      expect(ind.rows).toHaveLength(0); // no policy = service role only
    });
    await asUser(null, async () => {
      const r = await db.query<any>(`select * from public.reports`);
      expect(r.rows).toHaveLength(0);
    });
  });

  it('anon and authenticated cannot execute the service functions (Doctor C5)', async () => {
    for (const role of [null, '00000000-0000-0000-0000-000000000001']) {
      await asUser(role, async () => {
        await expect(db.query(`select * from public.herd_lookup('fffff')`)).rejects.toThrow(/permission denied/);
        await expect(db.query(`select public.kill_indicators('SBI', array[]::text[], array[]::text[], array[]::text[])`)).rejects.toThrow(/permission denied/);
      });
    }
  });

  it('pay tables are writable by the company member only', async () => {
    await asUser('00000000-0000-0000-0000-000000000002', async () => {
      await db.query(`insert into public.pay_rules (org_id) values ('ACME')`);
      await expect(db.query(`insert into public.pay_rules (org_id) values ('SBI')`)).rejects.toThrow(/row-level security/);
    });
  });
});
