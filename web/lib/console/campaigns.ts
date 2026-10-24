// Radar grouping (Section 14.2): reports that share any indicator hash belong to one campaign.
export interface ReportRow {
  id: string; bank_id: string; channel: string; rules: string[]; severity: string; indicator_hashes: string[];
  status: string; received_at: string; seeded?: boolean;
}

export interface Campaign {
  key: string;
  reports: ReportRow[];
  hashes: string[];
  last: string;
  channels: string[];
  topRules: string[];
  severity: string;
  status: 'live' | 'blocked' | 'closed';
  open: number;
}

const SEV = ['none', 'medium', 'high', 'critical'];

/** Union-find over shared hashes; reports without indicators stay on their own. */
export function groupCampaigns(rows: ReportRow[]): Campaign[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  rows.forEach((r, i) => r.indicator_hashes.forEach((h) => {
    const j = owner.get(h);
    if (j === undefined) owner.set(h, i); else parent[find(i)] = find(j);
  }));
  const groups = new Map<number, ReportRow[]>();
  rows.forEach((r, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), r]); });
  return [...groups.values()].map((rs) => {
    rs.sort((a, b) => b.received_at.localeCompare(a.received_at));
    const ruleCount = new Map<string, number>();
    rs.forEach((r) => r.rules.forEach((x) => ruleCount.set(x, (ruleCount.get(x) ?? 0) + 1)));
    const open = rs.filter((r) => r.status === 'delivered' || r.status === 'opened').length;
    const blocked = rs.every((r) => r.status === 'blocked');
    return {
      key: [...new Set(rs.flatMap((r) => r.indicator_hashes))].sort()[0] ?? rs[0].id,
      reports: rs,
      hashes: [...new Set(rs.flatMap((r) => r.indicator_hashes))],
      last: rs[0].received_at,
      channels: [...new Set(rs.map((r) => r.channel))],
      topRules: [...ruleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
      severity: rs.map((r) => r.severity).sort((a, b) => SEV.indexOf(b) - SEV.indexOf(a))[0],
      status: (blocked ? 'blocked' : open ? 'live' : 'closed') as Campaign['status'],
      open,
    };
  }).sort((a, b) => b.last.localeCompare(a.last));
}
