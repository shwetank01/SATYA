// Fraud Overview numbers (Section 23.3), computed from what the gateway already holds: inbox rows
// (tags only, never the sealed box), the blocklist and herd sightings. Pure, so tests run it on
// fixtures and the route only gathers inputs.
import type { BlockRow, HerdEntry, ReportIndexRow } from '../store';

/**
 * Average loss per reported financial-fraud incident in India in 2024: Rs 22,845.73 crore lost
 * across 36,37,288 incidents on NCRP/CFCFRMS (MHA written reply, Lok Sabha, July 2025).
 */
export const LOSS_2024_INR = 22_845.73e7;
export const INCIDENTS_2024 = 3_637_288;
export const AVG_LOSS_INR = Math.round(LOSS_2024_INR / INCIDENTS_2024); // 62,810

const DAY = 86_400_000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const tally = <K extends string>(keys: K[]) => {
  const m = new Map<K, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
};

export interface BankMetrics {
  generated_at: string;
  reports_30d: number;
  reports_prev_30d: number;
  reports_7d: number;
  open: number;
  unread: number;
  by_day: { day: string; n: number }[];
  by_channel: { key: string; n: number }[];
  by_severity: { key: string; n: number }[];
  closed_30d: number;
  median_minutes_to_action: number | null;
  blocked_by_you: number;
  blocked_network: number;
  phones_warned: number;
  demo_rows: number;
}

/**
 * `phones_warned`: herd sightings, from the day of the block onwards, of values this bank blocked.
 * A sighting is one phone, once a day, that checked the value, and every one of those phones was
 * shown "Confirmed fake by <bank>". The herd keeps 8 days of sightings, so this is a rolling count.
 */
export function bankMetrics(org: string, rows: ReportIndexRow[], blocklist: BlockRow[], herd: Map<string, HerdEntry>, now = Date.now()): BankMetrics {
  const t = (iso: string) => new Date(iso).getTime();
  const in30 = rows.filter((r) => t(r.received_at) > now - 30 * DAY);
  const prev30 = rows.filter((r) => t(r.received_at) <= now - 30 * DAY && t(r.received_at) > now - 60 * DAY);
  const days = Array.from({ length: 14 }, (_, i) => dayOf(now - (13 - i) * DAY));
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const r of rows) { const d = r.received_at.slice(0, 10); if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1); }
  const closed = in30.filter((r) => r.closed_at && (r.status === 'blocked' || r.status === 'dismissed'));
  const mine = blocklist.filter((b) => b.by === org);
  let warned = 0;
  for (const b of mine) {
    const e = herd.get(b.h);
    if (!e) continue;
    const from = b.at.slice(0, 10);
    for (const [d, tokens] of Object.entries(e.days)) if (d >= from) warned += tokens.length;
  }
  return {
    generated_at: new Date(now).toISOString(),
    reports_30d: in30.length,
    reports_prev_30d: prev30.length,
    reports_7d: rows.filter((r) => t(r.received_at) > now - 7 * DAY).length,
    open: rows.filter((r) => r.status === 'delivered' || r.status === 'opened').length,
    unread: rows.filter((r) => r.status === 'delivered').length,
    by_day: days.map((day) => ({ day, n: perDay.get(day)! })),
    by_channel: tally(in30.map((r) => r.channel)),
    by_severity: tally(in30.map((r) => r.severity)),
    closed_30d: closed.length,
    median_minutes_to_action: median(closed.map((r) => (t(r.closed_at!) - t(r.received_at)) / 60_000)),
    blocked_by_you: mine.length,
    blocked_network: blocklist.length,
    phones_warned: warned,
    demo_rows: rows.filter((r) => r.demo).length,
  };
}

/** Loss avoided under an explicit assumption: `oneIn` of the warned phones would have paid. */
export const lossAvoided = (phonesWarned: number, oneIn: number) => (oneIn > 0 ? Math.round((phonesWarned / oneIn) * AVG_LOSS_INR) : 0);

// ---------------------------------------------------------------- case register (CSV)

/** A cell that a spreadsheet must not run as a formula, quoted for CSV. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/**
 * The bank's case register: one line per report, tags only (the sealed content never leaves the
 * bank's browser), for its internal fraud reporting and for sharing with I4C or the police.
 */
export function caseRegister(rows: ReportIndexRow[]): string {
  const head = ['report_id', 'received_at', 'channel', 'severity', 'rules', 'status', 'closed_at', 'minutes_to_action', 'scammer_value_fingerprints', 'demo'];
  return csv([head, ...rows.map((r) => [
    r.id, r.received_at, r.channel, r.severity, r.rules.join(' '), r.status, r.closed_at ?? '',
    r.closed_at ? Math.round((new Date(r.closed_at).getTime() - new Date(r.received_at).getTime()) / 60_000) : '',
    r.ih.join(' '), r.demo ? 'yes' : '',
  ])]);
}
