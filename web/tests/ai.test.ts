import { describe, expect, it } from 'vitest';
import { analysisMessages, cleanAnalysis } from '../lib/ai/analyze';
import { parseJsonLoose } from '../lib/ai/sarvam';
import { seen7d } from '../lib/store';

describe('Sarvam answers are clamped before anyone sees them', () => {
  it('keeps a well-formed answer', () => {
    const a = cleanAnalysis({ ask_type: 'pay_fee', claimed_bank: 'SBI', urgency: 'high', confidence: 0.92, risk: 'scam', summary: 'Asks for a KYC fee.', summary_hi: 'KYC फ़ीस माँगता है।', reasons: ['Fee for KYC'], advice: 'Do not pay.', advice_hi: 'भुगतान न करें।' }, 'sarvam-105b');
    expect(a).toMatchObject({ ask_type: 'pay_fee', claimed_bank: 'SBI', risk: 'scam', confidence: 0.92, source: 'ai', model: 'sarvam-105b' });
  });

  it('replaces values outside the enums and limits', () => {
    const a = cleanAnalysis({ ask_type: 'steal_everything', claimed_bank: 'Kotak', confidence: 7, risk: 'very bad', reasons: ['a', 'b', 'c', 'd', 5], summary: 'x'.repeat(900) }, 'm');
    expect(a.ask_type).toBe('other');
    expect(a.claimed_bank).toBe('NONE');
    expect(a.confidence).toBe(1);
    expect(a.risk).toBe('unclear');
    expect(a.reasons).toEqual(['a', 'b', 'c']);
    expect(a.summary.length).toBe(240);
  });

  it('reads JSON wrapped in prose or a code fence', () => {
    expect(parseJsonLoose<any>('Sure:\n```json\n{"risk":"safe"}\n```')).toEqual({ risk: 'safe' });
    expect(() => parseJsonLoose('no json here')).toThrow();
  });

  it('sends the hint and the masked text last, after the few-shot examples', () => {
    const m = analysisMessages('[NAME] pay [UPI_1]', { bank: 'SBI', channel: 'sms', sender: 'VM-SBIUPD' });
    expect(m[0].role).toBe('system');
    expect(m.at(-1)).toEqual({ role: 'user', content: '[channel: sms; sender: VM-SBIUPD; bank the phone detected: SBI]\n[NAME] pay [UPI_1]' });
  });
});

describe('herd counts', () => {
  it('counts distinct day tokens over the last 7 days only', () => {
    const today = new Date('2026-10-25T10:00:00Z');
    const e = { t: 'upi', reports: 0, confirmed_by: null, label: null, days: { '2026-10-25': ['a', 'b'], '2026-10-19': ['c'], '2026-10-18': ['old'] } };
    expect(seen7d(e, today)).toBe(3);
  });
});
