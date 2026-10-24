import { describe, expect, it } from 'vitest';
import { groupCampaigns, type ReportRow } from '../lib/console/campaigns';

const r = (id: string, hashes: string[], at: string, status = 'delivered', severity = 'high'): ReportRow =>
  ({ id, bank_id: 'SBI', channel: 'sms', rules: ['G02_LINK_BANK_IN'], severity, indicator_hashes: hashes, status, received_at: at });

describe('groupCampaigns', () => {
  it('joins reports transitively through shared hashes', () => {
    const c = groupCampaigns([r('1', ['a', 'b'], '2026-10-24T01'), r('2', ['b'], '2026-10-24T03'), r('3', ['c'], '2026-10-24T02'), r('4', ['b', 'c'], '2026-10-24T04'), r('5', ['z'], '2026-10-20T00')]);
    expect(c).toHaveLength(2);
    expect(c[0].reports.map((x) => x.id)).toEqual(['4', '2', '3', '1']);
    expect(c[0].hashes.sort()).toEqual(['a', 'b', 'c']);
  });
  it('reports the worst severity and a blocked status only when all are blocked', () => {
    const [c] = groupCampaigns([r('1', ['a'], '2026-10-24T01', 'blocked', 'critical'), r('2', ['a'], '2026-10-24T02', 'opened', 'medium')]);
    expect(c.severity).toBe('critical');
    expect(c.status).toBe('live');
    expect(c.open).toBe(1);
  });
});
