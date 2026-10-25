import { describe, expect, it } from 'vitest';
import { AVG_LOSS_INR, bankMetrics, caseRegister, csvCell, lossAvoided } from '../lib/console/metrics';
import type { BlockRow, HerdEntry, ReportIndexRow } from '../lib/store';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const H = (c: string) => c.repeat(64);
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const row = (id: string, over: Partial<ReportIndexRow>): ReportIndexRow => ({
  id, bank_id: 'SBI', channel: 'sms', rules: ['G01_NO_SECRETS'], severity: 'critical', hour: '2026-10-25T10', sealed_hash: H('0'),
  received_at: ago(60), status: 'delivered', updated_at: ago(60), indicator_count: 1, ih: [H('a')], ...over,
});

describe('Fraud Overview metrics', () => {
  const rows = [
    row('a', {}),
    row('b', { status: 'blocked', received_at: ago(200), closed_at: ago(190), channel: 'whatsapp' }),
    row('c', { status: 'dismissed', received_at: ago(100), closed_at: ago(70) }),
    row('old', { received_at: ago(45 * 1440) }),
  ];
  const blocks: BlockRow[] = [
    { h: H('a'), t: 'upi', by: 'SBI', label: 'UPI kyc***@ybl', at: '2026-10-23T09:00:00.000Z' },
    { h: H('b'), t: 'tel', by: 'HDFC', label: 'Number 98xxxxxx10', at: '2026-10-20T09:00:00.000Z' },
  ];
  const herd = new Map<string, HerdEntry>([
    [H('a'), { t: 'upi', days: { '2026-10-22': ['x', 'y'], '2026-10-23': ['p'], '2026-10-25': ['q', 'r', 's'] }, reports: 3, confirmed_by: 'SBI', label: null }],
  ]);
  const m = bankMetrics('SBI', rows, blocks, herd, NOW);

  it('counts the 30-day window and the one before it separately', () => {
    expect(m.reports_30d).toBe(3);
    expect(m.reports_prev_30d).toBe(1);
    expect(m.open).toBe(2);
    expect(m.unread).toBe(2);
  });

  it('median time to act runs from receipt to block or dismiss', () => {
    expect(m.closed_30d).toBe(2);
    expect(m.median_minutes_to_action).toBe(20); // 10 and 30 minutes
  });

  it('customers warned counts only sightings from the day of this bank’s block onwards', () => {
    expect(m.blocked_by_you).toBe(1);
    expect(m.blocked_network).toBe(2);
    expect(m.phones_warned).toBe(4); // 23rd (1) + 25th (3); the 22nd was before the block
  });

  it('has 14 days ending today, and channels sorted by volume', () => {
    expect(m.by_day).toHaveLength(14);
    expect(m.by_day.at(-1)).toEqual({ day: '2026-10-25', n: 3 });
    expect(m.by_channel[0]).toEqual({ key: 'sms', n: 2 });
  });

  it('loss avoided uses the stated I4C 2024 average and the analyst’s 1-in-N', () => {
    expect(AVG_LOSS_INR).toBe(62_810);
    expect(lossAvoided(40, 10)).toBe(4 * 62_810);
    expect(lossAvoided(40, 0)).toBe(0);
  });
});

describe('case register CSV', () => {
  it('never lets a spreadsheet run a cell as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98')).toBe("'+91 98");
    expect(csvCell('plain')).toBe('plain');
  });

  it('one line per report with minutes to action, tags only', () => {
    const out = caseRegister([row('b', { status: 'blocked', received_at: ago(200), closed_at: ago(190) })]);
    const [head, line] = out.trim().split('\r\n');
    expect(head.split(',')).toContain('minutes_to_action');
    expect(line).toContain(',blocked,');
    expect(line).toContain(',10,');
    expect(out).not.toContain('sealed');
  });
});
