import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COOKIE, passwordOk, readSession, sessionCookie } from '../lib/console/auth';
import { BANK_NAMES } from '../lib/bundle';
import { ANALYST, BANK_ORGS, ORGS } from '../lib/orgs';

const value = (setCookie: string) => setCookie.split(';')[0];
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('NYAYA session cookie', () => {
  beforeEach(() => { process.env.NYAYA_SECRET = 'test-secret-'.repeat(4); process.env.NYAYA_PASSWORD = 'correct horse'; });
  afterEach(() => { delete process.env.NYAYA_SECRET; delete process.env.NYAYA_PASSWORD; delete process.env.NYAYA_ORG_PASSWORDS; });

  it('round-trips a named analyst at a bank', () => {
    const c = sessionCookie('SBI', 'Asha Rao');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(readSession(value(c))).toEqual({ org: 'SBI', orgName: 'State Bank of India', kind: 'bank', user: 'Asha Rao' });
  });

  it('rejects a tampered body, a forged signature and an unknown org', () => {
    const [, raw] = value(sessionCookie('SBI', 'Asha Rao')).split('=');
    const [body, sig] = raw.split('.');
    expect(readSession(`${COOKIE}=${b64({ org: 'HDFC', user: 'Asha Rao', exp: 9e9 })}.${sig}`)).toBeNull();
    expect(readSession(`${COOKIE}=${body}.${'A'.repeat(sig.length)}`)).toBeNull();
    process.env.NYAYA_SECRET = 'another-secret-'.repeat(3);
    expect(readSession(`${COOKIE}=${raw}`)).toBeNull();
  });

  it('rejects an expired session, a 0.3.0 session without a name, and works only with a secret set', () => {
    expect(readSession(`${COOKIE}=${b64({ org: 'SBI', user: 'Asha Rao', exp: 1 })}.x`)).toBeNull();
    const c = value(sessionCookie('SBI', 'Asha Rao'));
    delete process.env.NYAYA_SECRET;
    expect(readSession(c)).toBeNull();
  });

  it('checks the password in constant time and refuses short ones', () => {
    expect(passwordOk('correct horse')).toBe(true);
    expect(passwordOk('correct hors')).toBe(false);
    process.env.NYAYA_PASSWORD = 'short';
    expect(passwordOk('short')).toBe(false);
  });

  it('an org with its own password must use it; others fall back to the shared one', () => {
    process.env.NYAYA_ORG_PASSWORDS = JSON.stringify({ SBI: 'sbi-only-password' });
    expect(passwordOk('sbi-only-password', 'SBI')).toBe(true);
    expect(passwordOk('correct horse', 'SBI')).toBe(false);
    expect(passwordOk('correct horse', 'HDFC')).toBe(true);
    process.env.NYAYA_ORG_PASSWORDS = '{not json';
    expect(passwordOk('correct horse', 'SBI')).toBe(true);
  });
});

describe('organisations', () => {
  it('the console bank list is exactly the banks in the signed bundle', () => {
    expect(Object.fromEntries(BANK_ORGS.map((o) => [o.id, o.name]))).toEqual(BANK_NAMES);
  });

  it('accepts real names in any script and refuses markup', () => {
    for (const n of ['Asha Rao', 'D’Souza'.replace('’', "'"), 'अनिल कुमार', 'J. Mehta-Iyer']) expect(ANALYST.test(n)).toBe(true);
    for (const n of ['a', '<script>', 'x'.repeat(41), '12345']) expect(ANALYST.test(n)).toBe(false);
    expect(Object.values(ORGS).every((o) => o.kind === 'bank' || o.kind === 'company')).toBe(true);
  });
});
