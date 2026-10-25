// Gateway storage on a private Vercel Blob store (first-party, no third-party database account).
// Every read-modify-write is a compare-and-swap on the blob's ETag, so concurrent phones can't
// lose each other's sightings or reports. Supabase (lib/gateway.ts db()) remains the Section 12
// target; this store is what runs until that account exists.
import { BlobError, BlobPreconditionFailedError, del, get, put } from '@vercel/blob';

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

export interface BlockRow { h: string; t: 'upi' | 'tel' | 'host' | 'app' | 'acct'; by: string; label: string; at: string; demo?: boolean }

export const getBlocklist = async () => (await readJson<BlockRow[]>('blocklist.json')) ?? [];

export async function addToBlocklist(bank: string, items: { t: BlockRow['t']; h: string; label: string }[]) {
  const at = new Date().toISOString();
  await update<BlockRow[]>('blocklist.json', () => [], (rows) => {
    const have = new Set(rows.map((r) => r.h));
    return [...items.filter((i) => !have.has(i.h)).map((i) => ({ ...i, by: bank, at })), ...rows].slice(0, 5000);
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
