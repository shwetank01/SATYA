// The TypeScript ports must pass the same shared vectors as the Python oracle and Kotlin.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mask } from '../lib/satya/mask';
import { evaluate, ruleBookFromRegistry } from '../lib/satya/rules';
import { normalize, maskedLabel } from '../lib/satya/normalize';
import { dayToken, fromHex, ticketHash } from '../lib/satya/hash';
import { payCheck } from '../lib/satya/paycheck';

const SPEC = path.resolve(__dirname, '..', '..', 'spec');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(SPEC, f), 'utf8'));

describe('Appendix A: rule cases', () => {
  const book = ruleBookFromRegistry(read('satya_bank_promises.json'));
  const cases = read('rule_cases.json').cases;
  it('has at least 17 cases', () => expect(cases.length).toBeGreaterThanOrEqual(17));
  for (const c of cases) {
    it(c.id, () => {
      const r = evaluate(book, { text: c.text, channel: c.channel, sender: c.sender });
      expect(r.bank).toBe(c.claims);
      expect(r.hits.map((h) => h[0]).sort()).toEqual([...c.expected].sort());
      const sev = Object.fromEntries(r.hits);
      for (const [k, v] of Object.entries(c.severity)) expect(sev[k]).toBe(v);
    });
  }
});

describe('Appendix B: mask vectors', () => {
  for (const v of read('mask_vectors.json').vectors) {
    it(v.in, () => expect(mask(v.in, v.my_names, v.my_phones)).toBe(v.out));
  }
});

describe('Appendix C: hash vectors', () => {
  const root = read('hash_vectors.json');
  for (const v of root.normalize_and_hash) {
    it(`${v.type} ${v.raw}`, () => {
      const ind = normalize(v.type, v.raw);
      expect(ind.canonical).toBe(v.canonical);
      expect(ind.h).toBe(v.sha256);
      expect(ind.prefix).toBe(v.prefix);
    });
  }
  it('day token', () => {
    const d = root.day_token;
    expect(dayToken(fromHex(d.install_secret_hex), d.day, d.hash)).toBe(d.token);
  });
  it('ticket hash', () => expect(ticketHash(root.ticket.ticket)).toBe(root.ticket.ticket_hash));
  it('masked labels never contain the raw value', () => {
    expect(maskedLabel('upi', 'upi:sbi.kyc@ybl')).toBe('UPI sbi.k***@ybl');
    expect(maskedLabel('tel', 'tel:7012345645')).not.toContain('7012345645');
  });
});

describe('Appendix E: Pay Check', () => {
  const s = read('paycheck_cases.json');
  for (const c of s.cases) {
    it(c.id, () => {
      const r = payCheck(s.rules, c, s.voice_threshold);
      expect(r.amount).toBe(c.expect_amount);
      expect(r.flags).toEqual([...c.expect_flags].sort());
      expect(r.decision).toBe(c.expect_decision);
    });
  }
});
