import { describe, expect, it } from 'vitest';
import { DEMO_MULES, sampleAccounts } from '../lib/demo';
import { maskedLabel, upi } from '../lib/satya/normalize';
import { bankOfIfsc, bankOfUpi, pspName } from '../lib/satya/psp';

describe('Mule Watch routing', () => {
  it('routes a UPI ID or its masked label to the bank behind the handle', () => {
    expect(bankOfUpi('rahul.kyc99@oksbi')).toBe('SBI');
    expect(bankOfUpi(maskedLabel('upi', upi('refund.desk@okhdfcbank').canonical))).toBe('HDFC');
    expect(bankOfUpi('x@IBL')).toBe('ICICI');
    expect(bankOfUpi('x@axl')).toBe('AXIS');
  });

  it('never guesses: an unknown handle or a bank outside the console has no home', () => {
    expect(bankOfUpi('x@ybl')).toBeNull();
    expect(pspName('x@ybl')).toBe('Yes Bank');
    expect(bankOfUpi('no-handle')).toBeNull();
  });

  it('routes an account by the first four letters of its IFSC', () => {
    expect(bankOfIfsc('HDFC0001234')).toBe('HDFC');
    expect(bankOfIfsc('utib0000123')).toBe('AXIS');
    expect(bankOfIfsc('SBIN0001')).toBe('SBI');
    expect(bankOfIfsc('KKBK0000001')).toBeNull();
  });

  it('every demo mule really lives at the bank it is filed under, and is in that bank’s sample list', () => {
    for (const [bank, mules] of Object.entries(DEMO_MULES)) {
      const sample = sampleAccounts(bank).join('\n');
      for (const m of mules) {
        expect(m.upi ? bankOfUpi(m.upi) : bankOfIfsc(m.acct![1])).toBe(bank);
        expect(m.by).not.toBe(bank);
        expect(sample).toContain(m.upi ?? m.acct![0]);
      }
    }
  });
});
