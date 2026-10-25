// Impersonation Radar grouping (Section 14.2): reports that share any scammer value (the same UPI
// ID, number, site or app fingerprint) belong to one campaign. Runs on inbox rows, so the sealed
// contents are never needed.
import { isChannelRule } from './ruleNames';

export interface RadarRow {
  id: string; channel: string; rules: string[]; severity: string; ih: string[];
  status: string; received_at: string; demo?: boolean;
}

export interface Campaign {
  key: string;
  reports: RadarRow[];
  hashes: string[];
  first: string;
  last: string;
  channels: string[];
  topRules: string[];
  severity: string;
  status: 'live' | 'blocked' | 'closed';
  open: number;
}

const SEV = ['none', 'medium', 'high', 'critical'];

/** Union-find over shared fingerprints; a report without any stays a campaign of one. */
export function groupCampaigns(rows: RadarRow[]): Campaign[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  rows.forEach((r, i) => r.ih.forEach((h) => {
    const j = owner.get(h);
    if (j === undefined) owner.set(h, i); else parent[find(i)] = find(j);
  }));
  const groups = new Map<number, RadarRow[]>();
  rows.forEach((r, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), r]); });
  return [...groups.values()].map((rs) => {
    rs.sort((a, b) => b.received_at.localeCompare(a.received_at));
    const ruleCount = new Map<string, number>();
    rs.forEach((r) => r.rules.forEach((x) => ruleCount.set(x, (ruleCount.get(x) ?? 0) + 1)));
    const open = rs.filter((r) => r.status === 'delivered' || r.status === 'opened').length;
    const hashes = [...new Set(rs.flatMap((r) => r.ih))];
    return {
      key: [...hashes].sort()[0] ?? rs[0].id,
      reports: rs,
      hashes,
      first: rs[rs.length - 1].received_at,
      last: rs[0].received_at,
      channels: [...new Set(rs.map((r) => r.channel))],
      // Named for what the scam asks for; channel rules ("SMS from a phone number") come after.
      topRules: [...ruleCount.entries()].sort((a, b) => Number(isChannelRule(a[0])) - Number(isChannelRule(b[0])) || b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k),
      severity: rs.map((r) => r.severity).sort((a, b) => SEV.indexOf(b) - SEV.indexOf(a))[0],
      status: (rs.every((r) => r.status === 'blocked') ? 'blocked' : open ? 'live' : 'closed') as Campaign['status'],
      open,
    };
  }).sort((a, b) => (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0) || b.reports.length - a.reports.length || b.last.localeCompare(a.last));
}
