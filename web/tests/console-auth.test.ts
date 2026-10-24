import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COOKIE, passwordOk, readSession, sessionCookie } from '../lib/console/auth';

const value = (setCookie: string) => setCookie.split(';')[0];

describe('NYAYA session cookie', () => {
  beforeEach(() => { process.env.NYAYA_SECRET = 'test-secret-'.repeat(4); process.env.NYAYA_PASSWORD = 'correct horse'; });
  afterEach(() => { delete process.env.NYAYA_SECRET; delete process.env.NYAYA_PASSWORD; });

  it('round-trips a bank session', () => {
    const c = sessionCookie('SBI');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Strict');
    expect(readSession(value(c))).toEqual({ org: 'SBI', orgName: 'State Bank of India' });
  });

  it('rejects a tampered body, a forged signature and an unknown bank', () => {
    const [, raw] = value(sessionCookie('SBI')).split('=');
    const [body, sig] = raw.split('.');
    const other = Buffer.from(JSON.stringify({ org: 'HDFC', exp: 9e9 })).toString('base64url');
    expect(readSession(`${COOKIE}=${other}.${sig}`)).toBeNull();
    expect(readSession(`${COOKIE}=${body}.${'A'.repeat(sig.length)}`)).toBeNull();
    process.env.NYAYA_SECRET = 'another-secret-'.repeat(3);
    expect(readSession(`${COOKIE}=${raw}`)).toBeNull();
  });

  it('rejects an expired session and works only with a secret set', () => {
    const old = Buffer.from(JSON.stringify({ org: 'SBI', exp: 1 })).toString('base64url');
    expect(readSession(`${COOKIE}=${old}.x`)).toBeNull();
    const c = value(sessionCookie('SBI'));
    delete process.env.NYAYA_SECRET;
    expect(readSession(c)).toBeNull();
  });

  it('checks the password in constant time and refuses short ones', () => {
    expect(passwordOk('correct horse')).toBe(true);
    expect(passwordOk('correct hors')).toBe(false);
    process.env.NYAYA_PASSWORD = 'short';
    expect(passwordOk('short')).toBe(false);
  });
});
