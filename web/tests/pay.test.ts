import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { signPayReceipt } from '../lib/payreceipt';
import { payReceiptMessage, signKeypair, verifyHex } from '../lib/satya/crypto';
import { acct } from '../lib/satya/normalize';
import { holds, payCheck, reasonOf, severityOf, upiIds, vendorHash } from '../lib/satya/paycheck';

const cases = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'spec', 'paycheck_cases.json'), 'utf8'));

describe('Pay Check network flags (Section 23.7)', () => {
  it('leave the Appendix E vectors exactly as the oracle has them', () => {
    for (const c of cases.cases) {
      const r = payCheck(cases.rules, c, cases.voice_threshold);
      expect(r.flags).toEqual(c.expect_flags);
      expect(r.decision).toBe(c.expect_decision);
    }
  });

  it('a confirmed-fake destination is critical and holds even an otherwise clean request', () => {
    expect(severityOf('NETWORK_BLOCKED')).toBe('critical');
    expect(severityOf('NETWORK_REPORTED')).toBe('high');
    expect(holds([])).toBe(false);
    expect(holds(['OVER_LIMIT'])).toBe(false);
    expect(holds(['NETWORK_BLOCKED'])).toBe(true);
    expect(reasonOf('NETWORK_BLOCKED')).toMatch(/confirmed this account/);
    expect(reasonOf('NEW_ACCOUNT')).toMatch(/saved vendor/);
  });

  it('a vendor saved from Pay Rules (hashed in the browser) is the same account Pay Check sees', () => {
    const saved = acct('50100987654321', 'HDFC0001234').h;
    expect(vendorHash({ vendor_name: 'Sharma Traders', account: '50100987654321', ifsc: 'HDFC0001234' })).toBe(saved);
  });

  it('finds UPI IDs in a request but not email addresses', () => {
    expect(upiIds('Pay Rs 9,999 to refund.desk@okhdfcbank today, invoice from billing@acme.co.in')).toEqual(['refund.desk@okhdfcbank']);
  });
});

describe('signed Pay Check receipts', () => {
  afterEach(() => { delete process.env.SATYA_RECEIPT_SK; });

  it('sign the check id, request hash, decision and time with the Receipt key', async () => {
    const kp = await signKeypair();
    process.env.SATYA_RECEIPT_SK = kp.sk;
    const r = (await signPayReceipt('id-1', 'ab'.repeat(32), 'blocked', '2026-10-25T10:00:00.000Z'))!;
    expect(r.message).toBe(payReceiptMessage('id-1', 'ab'.repeat(32), 'blocked', '2026-10-25T10:00:00.000Z'));
    expect(await verifyHex(r.message, r.sig, kp.pk)).toBe(true);
    expect(await verifyHex(r.message.replace('blocked', 'released'), r.sig, kp.pk)).toBe(false);
  });

  it('refuse to sign without a key rather than record an unsigned decision', async () => {
    expect(await signPayReceipt('id-1', 'ab'.repeat(32), 'hold')).toBeNull();
  });
});
