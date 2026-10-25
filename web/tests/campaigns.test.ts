import { describe, expect, it } from 'vitest';
import { groupCampaigns, type RadarRow } from '../lib/console/campaigns';

const H = (c: string) => c.repeat(64);
const r = (id: string, ih: string[], over: Partial<RadarRow> = {}): RadarRow => ({
  id, channel: 'sms', rules: ['G08_NO_KYC_FEE'], severity: 'high', ih, status: 'delivered', received_at: `2026-10-25T10:0${id.length}:00.000Z`, ...over,
});

describe('Impersonation Radar', () => {
  it('joins reports that share any value, transitively', () => {
    // a–b share UPI x; b–c share number y; d stands alone.
    const out = groupCampaigns([r('a', [H('x')]), r('bb', [H('x'), H('y')]), r('ccc', [H('y')], { channel: 'whatsapp', severity: 'critical' }), r('d', [H('z')])]);
    expect(out).toHaveLength(2);
    const big = out.find((c) => c.reports.length === 3)!;
    expect(big.hashes.sort()).toEqual([H('x'), H('y')]);
    expect(big.channels.sort()).toEqual(['sms', 'whatsapp']);
    expect(big.severity).toBe('critical');
  });

  it('a report without values is a campaign of one', () => {
    expect(groupCampaigns([r('a', []), r('b', [])])).toHaveLength(2);
  });

  it('status: blocked only when every report is blocked; live while any is open', () => {
    const [c] = groupCampaigns([r('a', [H('x')], { status: 'blocked' }), r('b', [H('x')], { status: 'opened' })]);
    expect(c.status).toBe('live');
    expect(c.open).toBe(1);
    const [d] = groupCampaigns([r('a', [H('x')], { status: 'blocked' }), r('b', [H('x')], { status: 'blocked' })]);
    expect(d.status).toBe('blocked');
  });

  it('is named for what it asks, not the channel it came on', () => {
    const [c] = groupCampaigns([r('a', [H('x')], { rules: ['G05_SMS_FROM_HEADER_NOT_NUMBER', 'G08_NO_KYC_FEE'] }), r('b', [H('x')], { rules: ['G05_SMS_FROM_HEADER_NOT_NUMBER'] })]);
    expect(c.topRules).toEqual(['G08_NO_KYC_FEE', 'G05_SMS_FROM_HEADER_NOT_NUMBER']);
  });

  it('live campaigns come first, then the biggest', () => {
    const out = groupCampaigns([r('a', [H('x')], { status: 'blocked' }), r('b', [H('x')], { status: 'blocked' }), r('c', [H('y')])]);
    expect(out[0].status).toBe('live');
  });
});
