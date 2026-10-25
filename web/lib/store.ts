// Gateway storage on a private Vercel Blob store (first-party, no third-party database account).
// Every read-modify-write is a compare-and-swap on the blob's ETag, so concurrent phones can't
// lose each other's sightings or reports. Supabase (lib/gateway.ts db()) remains the Section 12
// target; this store is what runs until that account exists.
import { BlobError, BlobPreconditionFailedError, del, get, put } from '@vercel/blob';
import { bankOfUpi } from './satya/psp';

export const storeConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// SATYA_STORE_PREFIX (e.g. "dev/") gives local runs their own namespace in the same store, so
// `next dev` never writes into the reports, blocklist or herd counts that phones read in production.
const at = (pathname: string) => (process.env.SATYA_STORE_PREFIX ?? '') + pathname;

async function read<T>(pathname: string): Promise<{ data: T; etag: string } | null> {
  const r = await get(at(pathname), { access: 'private', useCache: false }).catch((e) => {
    if (e instanceof BlobError && /not.?found|does not exist/i.test(e.message)) return null;
    throw e;
  });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const text = await new Response(r.stream).text();
  // A compressed response carries a weak ETag (W/"…"); ifMatch on put needs the strong form.
  return { data: JSON.parse(text) as T, etag: r.blob.etag.replace(/^W\//, '') };
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  return (await read<T>(pathname))?.data ?? null;
}

async function write(pathname: string, data: unknown, etag?: string) {
  await put(at(pathname), JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
}

const conflict = (e: unknown) => e instanceof BlobPreconditionFailedError || (e instanceof BlobError && /already exists|precondition/i.test(e.message));

/** Create-or-update with optimistic concurrency. `fn` may be called more than once. */
export async function update<T>(pathname: string, init: () => T, fn: (cur: T) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await read<T>(pathname);
    const next = fn(cur ? cur.data : init());
    try {
      await write(pathname, next, cur?.etag);
      return next;
    } catch (e) {
      if (!conflict(e)) throw e;
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1) + Math.random() * 60));
    }
  }
  throw new Error('store_conflict');
}

export async function create(pathname: string, data: unknown) {
  await write(pathname, data);
}

/** Deletes one blob; a missing blob is not an error. */
export async function remove(pathname: string) {
  await del(at(pathname)).catch((e) => {
    if (e instanceof BlobError && /not.?found|does not exist/i.test(e.message)) return;
    throw e;
  });
}

// ---------------------------------------------------------------- reports (DOOT)

export type ReportStatus = 'delivered' | 'opened' | 'blocked' | 'dismissed';

export interface StoredReport {
  id: string;
  bank_id: string;
  channel: string;
  rules: string[];
  severity: string;
  indicators: { t: string; h: string }[];
  hour: string;
  sealed: string;
  sealed_hash: string;
  receipt_sig: string;
  ticket_hash: string;
  received_at: string;
  status: ReportStatus;
  updated_at: string;
  closed_at?: string;
  /** Written by scripts/demo-data.ts, never by a phone; the console labels these rows "Demo". */
  demo?: boolean;
}

/**
 * What the inbox lists without opening every report. `ih` (the scammer values' fingerprints) lets
 * Radar group campaigns and Kill find the reports it closes without reading each report blob.
 */
export type ReportIndexRow = Omit<StoredReport, 'sealed' | 'receipt_sig' | 'ticket_hash' | 'indicators'> & { indicator_count: number; ih: string[] };

const reportPath = (id: string) => `reports/${id}.json`;
const indexPath = (bank: string) => `index/${bank}.json`;

export const getReport = (id: string) => readJson<StoredReport>(reportPath(id));

export async function saveReport(r: StoredReport) {
  await create(reportPath(r.id), r);
  await update<ReportIndexRow[]>(indexPath(r.bank_id), () => [], (rows) => [toRow(r), ...rows.filter((x) => x.id !== r.id)].slice(0, 2000));
}

function toRow(r: StoredReport): ReportIndexRow {
  const { sealed: _s, receipt_sig: _r, ticket_hash: _t, indicators, ...rest } = r;
  return { ...rest, indicator_count: indicators.length, ih: [...new Set(indicators.map((i) => i.h))] };
}

/** Status only moves forward: delivered -> opened -> blocked | dismissed. */
const NEXT: Record<ReportStatus, ReportStatus[]> = { delivered: ['opened', 'blocked', 'dismissed'], opened: ['blocked', 'dismissed'], blocked: [], dismissed: [] };

export async function setStatus(id: string, status: ReportStatus): Promise<StoredReport | null> {
  const cur = await getReport(id);
  if (!cur) return null;
  if (!NEXT[cur.status].includes(status)) return cur;
  const now = new Date().toISOString();
  const next = await update<StoredReport>(reportPath(id), () => cur, (r) => ({
    ...r, status, updated_at: now, ...(status === 'blocked' || status === 'dismissed' ? { closed_at: now } : {}),
  }));
  await update<ReportIndexRow[]>(indexPath(next.bank_id), () => [], (rows) => rows.map((x) => (x.id === id ? toRow(next) : x)));
  return next;
}

/** This bank's inbox, newest first. Rows written before 0.4.0 lack `ih`; they are filled once. */
export async function listReports(bank: string): Promise<ReportIndexRow[]> {
  const rows = (await readJson<ReportIndexRow[]>(indexPath(bank))) ?? [];
  const stale = rows.filter((r) => !Array.isArray(r.ih));
  if (!stale.length) return rows;
  const filled = new Map<string, string[]>();
  for (const r of stale) {
    const full = await getReport(r.id).catch(() => null);
    filled.set(r.id, full ? [...new Set(full.indicators.map((i) => i.h))] : []);
  }
  const fix = (x: ReportIndexRow) => (Array.isArray(x.ih) ? x : { ...x, ih: filled.get(x.id) ?? [] });
  await update<ReportIndexRow[]>(indexPath(bank), () => [], (cur) => cur.map(fix)).catch(() => {});
  return rows.map(fix);
}

/** Removes a report and its inbox row (demo-data cleanup only; phones never delete). */
export async function deleteReport(bank: string, id: string) {
  await remove(reportPath(id));
  await update<ReportIndexRow[]>(indexPath(bank), () => [], (rows) => rows.filter((x) => x.id !== id));
}

// ---------------------------------------------------------------- herd counts (SANGH)

export interface HerdEntry { t: string; days: Record<string, string[]>; reports: number; confirmed_by: string | null; label: string | null }
export type HerdFile = Record<string, HerdEntry>;

export const herdPath = (prefix: string) => `herd/${prefix}.json`;
export const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);
const blank = (t: string): HerdEntry => ({ t, days: {}, reports: 0, confirmed_by: null, label: null });

export function seen7d(e: HerdEntry, today = new Date()): number {
  const cut = dayOf(new Date(today.getTime() - 6 * 86400_000));
  return Object.entries(e.days).filter(([d]) => d >= cut).reduce((n, [, tokens]) => n + tokens.length, 0);
}

export async function herdLookup(prefix: string) {
  const f = (await readJson<HerdFile>(herdPath(prefix))) ?? {};
  return Object.entries(f).map(([h, e]) => ({ h, t: e.t, seen_7d: seen7d(e), reports: e.reports, confirmed_by: e.confirmed_by, label: e.label }));
}

export type HerdMatch = Awaited<ReturnType<typeof herdLookup>>[number];

/** Several prefixes at once (the console's k-anonymous lookups); a missing file is simply empty. */
export async function herdLookupMany(prefixes: string[]): Promise<HerdMatch[]> {
  const out = await Promise.all([...new Set(prefixes)].map((p) => herdLookup(p).catch(() => [])));
  return out.flat();
}

/** Raw herd entries for exact hashes (server-side metrics only; never returned to a phone). */
export async function herdEntries(hashes: string[]): Promise<Map<string, HerdEntry>> {
  const byPrefix = new Map<string, string[]>();
  for (const h of hashes) byPrefix.set(h.slice(0, 5), [...(byPrefix.get(h.slice(0, 5)) ?? []), h]);
  const out = new Map<string, HerdEntry>();
  await Promise.all([...byPrefix].map(async ([p, hs]) => {
    const f = (await readJson<HerdFile>(herdPath(p)).catch(() => null)) ?? {};
    for (const h of hs) if (f[h]) out.set(h, f[h]);
  }));
  return out;
}

/** One sighting per (hash, day token): a phone counts once a day, and no IP or device is stored. */
export async function herdSight(h: string, t: string, dayToken: string) {
  const day = dayOf();
  const keep = dayOf(new Date(Date.now() - 8 * 86400_000));
  await update<HerdFile>(herdPath(h.slice(0, 5)), () => ({}), (f) => {
    const e = f[h] ?? blank(t);
    const tokens = e.days[day] ?? [];
    const days = Object.fromEntries(Object.entries(e.days).filter(([d]) => d >= keep));
    days[day] = tokens.includes(dayToken) ? tokens : [...tokens, dayToken].slice(-5000);
    return { ...f, [h]: { ...e, days } };
  });
}

export async function herdReport(indicators: { t: string; h: string }[]) {
  const byPrefix = new Map<string, { t: string; h: string }[]>();
  for (const i of indicators) byPrefix.set(i.h.slice(0, 5), [...(byPrefix.get(i.h.slice(0, 5)) ?? []), i]);
  for (const [prefix, items] of byPrefix) {
    await update<HerdFile>(herdPath(prefix), () => ({}), (f) => {
      const out = { ...f };
      for (const i of items) { const e = out[i.h] ?? blank(i.t); out[i.h] = { ...e, reports: e.reports + 1 }; }
      return out;
    });
  }
}

// ---------------------------------------------------------------- blocklist (One-Click Kill)

/** `home`: the bank that holds the account behind a UPI ID or account number (Mule Watch), when known. */
export interface BlockRow { h: string; t: 'upi' | 'tel' | 'host' | 'app' | 'acct'; by: string; label: string; at: string; home?: string | null; demo?: boolean }

export const getBlocklist = async () => (await readJson<BlockRow[]>('blocklist.json')) ?? [];

export async function addToBlocklist(bank: string, items: { t: BlockRow['t']; h: string; label: string; home?: string | null }[]) {
  const at = new Date().toISOString();
  // A UPI handle names its bank; for an account the console sends the bank from the IFSC.
  const homeOf = (i: (typeof items)[number]) => (i.t === 'upi' ? bankOfUpi(i.label) : i.t === 'acct' ? i.home ?? null : null);
  await update<BlockRow[]>('blocklist.json', () => [], (rows) => {
    const have = new Set(rows.map((r) => r.h));
    return [...items.filter((i) => !have.has(i.h)).map((i) => ({ h: i.h, t: i.t, label: i.label, by: bank, at, home: homeOf(i) })), ...rows].slice(0, 5000);
  });
  for (const i of items) {
    await update<HerdFile>(herdPath(i.h.slice(0, 5)), () => ({}), (f) => {
      const e = f[i.h] ?? blank(i.t);
      return { ...f, [i.h]: { ...e, confirmed_by: e.confirmed_by ?? bank, label: e.label ?? i.label } };
    });
  }
  // Close this bank's open reports that carry any of these values. The index row holds their
  // fingerprints, so this no longer reads every report in the inbox.
  const hashes = new Set(items.map((i) => i.h));
  let closed = 0;
  for (const row of await listReports(bank)) {
    if (row.status === 'blocked' || row.status === 'dismissed') continue;
    if (row.ih.some((h) => hashes.has(h))) { await setStatus(row.id, 'blocked'); closed++; }
  }
  return closed;
}

/** Removes blocklist rows (demo-data and smoke-test cleanup only; a real block is never undone here). */
export async function removeFromBlocklist(drop: (r: BlockRow) => boolean): Promise<BlockRow[]> {
  let gone: BlockRow[] = [];
  await update<BlockRow[]>('blocklist.json', () => [], (rows) => { gone = rows.filter(drop); return rows.filter((r) => !drop(r)); });
  return gone;
}

/** Forgets herd entries for exact hashes (cleanup only). */
export async function herdForget(hashes: string[]) {
  const byPrefix = new Map<string, Set<string>>();
  for (const h of hashes) byPrefix.set(h.slice(0, 5), (byPrefix.get(h.slice(0, 5)) ?? new Set()).add(h));
  for (const [p, hs] of byPrefix) {
    await update<HerdFile>(herdPath(p), () => ({}), (f) => Object.fromEntries(Object.entries(f).filter(([h]) => !hs.has(h))));
  }
}

// ---------------------------------------------------------------- Mule Watch (what a bank did about its mules)

export type MuleAction = 'frozen' | 'investigating' | 'not_ours';
export interface MuleRecord { action: MuleAction; at: string; user: string }

const mulePath = (bank: string) => `mules/${bank}.json`;

export const getMuleActions = async (bank: string) => (await readJson<Record<string, MuleRecord>>(mulePath(bank))) ?? {};

export async function setMuleAction(bank: string, h: string, action: MuleAction, user: string) {
  await update<Record<string, MuleRecord>>(mulePath(bank), () => ({}), (m) => ({ ...m, [h]: { action, at: new Date().toISOString(), user } }));
}

// ---------------------------------------------------------------- Pay Check (companies, I6-I9)

export interface PayVendor { id: string; vendor_name: string; acct_hash: string; acct_hint: string }
export interface PayApprover { id: string; name: string; role: string; callback_phone: string; max_amount_inr: number }
export interface PayRulesDoc { threshold_inr: number; allowed_channels: string[]; vendors: PayVendor[]; approvers: PayApprover[]; updated_at: string | null; updated_by: string | null }
export type PayDecision = 'hold' | 'clear' | 'released' | 'blocked';
export interface PayFlagRow { flag: string; severity: string; reason: string }
export interface PayReceipt { message: string; sig: string; decided_at: string }
export interface PayCheckRecord {
  id: string; created_at: string; created_by: string;
  requester: string; channel: string; amount_inr: number | null; request_hash: string; summary: string;
  flags: PayFlagRow[]; voice_score: number | null;
  initial: 'hold' | 'clear'; decision: PayDecision;
  verify?: { result: 'confirmed' | 'denied'; by: string; at: string; callback_phone: string | null };
  receipt: PayReceipt;
  demo?: boolean;
}

export const DEFAULT_PAY_RULES: PayRulesDoc = { threshold_inr: 100_000, allowed_channels: ['email', 'in_person'], vendors: [], approvers: [], updated_at: null, updated_by: null };

const payRulesPath = (org: string) => `pay/${org}/rules.json`;
const payChecksPath = (org: string) => `pay/${org}/checks.json`;

export const getPayRules = async (org: string) => (await readJson<PayRulesDoc>(payRulesPath(org))) ?? DEFAULT_PAY_RULES;

export async function savePayRules(org: string, rules: PayRulesDoc) {
  await update<PayRulesDoc>(payRulesPath(org), () => DEFAULT_PAY_RULES, () => rules);
}

export const listPayChecks = async (org: string) => (await readJson<PayCheckRecord[]>(payChecksPath(org))) ?? [];

export async function addPayCheck(org: string, rec: PayCheckRecord) {
  await update<PayCheckRecord[]>(payChecksPath(org), () => [], (rows) => [rec, ...rows.filter((r) => r.id !== rec.id)].slice(0, 1000));
}

/** Changes one check in place; returns the new record, or null when `fn` refuses (returns null). */
export async function updatePayCheck(org: string, id: string, fn: (r: PayCheckRecord) => PayCheckRecord | null): Promise<PayCheckRecord | null> {
  let out: PayCheckRecord | null = null;
  await update<PayCheckRecord[]>(payChecksPath(org), () => [], (rows) => rows.map((r) => {
    if (r.id !== id) return r;
    const next = fn(r);
    out = next;
    return next ?? r;
  }));
  return out;
}

// ---------------------------------------------------------------- partner API keys and usage

/** A key is shown once at creation; the gateway keeps only its SHA-256 and a short prefix to tell keys apart. */
export interface ApiKeyRow { id: string; prefix: string; hash: string; created_at: string; created_by: string; revoked_at: string | null; revoked_by: string | null }

const keysPath = (org: string) => `apikeys/${org}.json`;
const usagePath = (org: string, month: string) => `usage/${org}/${month}.json`;

export const listApiKeys = async (org: string) => (await readJson<ApiKeyRow[]>(keysPath(org))) ?? [];

export async function addApiKey(org: string, row: ApiKeyRow) {
  await update<ApiKeyRow[]>(keysPath(org), () => [], (rows) => [row, ...rows].slice(0, 50));
}

export async function revokeApiKey(org: string, id: string, user: string): Promise<ApiKeyRow | null> {
  let hit: ApiKeyRow | null = null;
  await update<ApiKeyRow[]>(keysPath(org), () => [], (rows) => rows.map((r) => {
    if (r.id !== id || r.revoked_at) return r;
    hit = { ...r, revoked_at: new Date().toISOString(), revoked_by: user };
    return hit;
  }));
  return hit;
}

export interface UsageFile { days: Record<string, number> }

export async function usageOf(org: string, months: string[]): Promise<Record<string, number>> {
  const files = await Promise.all(months.map((m) => readJson<UsageFile>(usagePath(org, m)).catch(() => null)));
  return Object.assign({}, ...files.map((f) => f?.days ?? {}));
}

/** Counts one partner call for today and returns today's total. */
export async function countCall(org: string, day = dayOf()): Promise<number> {
  const next = await update<UsageFile>(usagePath(org, day.slice(0, 7)), () => ({ days: {} }), (f) => ({ days: { ...f.days, [day]: (f.days[day] ?? 0) + 1 } }));
  return next.days[day];
}

// ---------------------------------------------------------------- audit trail (who did what, when)

export interface AuditEntry { at: string; user: string; action: string; target?: string; detail?: string }

const auditPath = (org: string) => `audit/${org}.json`;

/**
 * Appends one entry to the org's audit trail (newest first, last 2000 kept). Never throws: an
 * action that already happened is not undone because its log line could not be written.
 */
export async function logAction(org: string, user: string, action: string, target?: string, detail?: string) {
  const e: AuditEntry = { at: new Date().toISOString(), user, action, ...(target ? { target } : {}), ...(detail ? { detail: detail.slice(0, 200) } : {}) };
  await update<AuditEntry[]>(auditPath(org), () => [], (rows) => [e, ...rows].slice(0, 2000)).catch(() => {});
}

export const listAudit = async (org: string) => (await readJson<AuditEntry[]>(auditPath(org))) ?? [];
