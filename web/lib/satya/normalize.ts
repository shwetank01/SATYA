// Section 7.2 canonical forms. Must be byte-identical to android/core Normalize.kt (Kill matches across platforms).
import { prefixOf, sha256Hex } from './hash';

export type IndicatorType = 'upi' | 'tel' | 'host' | 'app' | 'acct';

export interface Indicator {
  t: IndicatorType;
  canonical: string;
  h: string;
  prefix: string;
}

const make = (t: IndicatorType, canonical: string): Indicator => {
  const h = sha256Hex(canonical);
  return { t, canonical, h, prefix: prefixOf(h) };
};

export const upi = (raw: string) => make('upi', 'upi:' + raw.trim().toLowerCase());

export function telDigits(raw: string): string {
  let d = raw.replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const tel = (raw: string) => make('tel', 'tel:' + telDigits(raw));

/** Hostname only: no scheme, userinfo, port, path, query or fragment. */
export function hostName(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const cut = s.search(/[/?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.slice(s.lastIndexOf('@') + 1);
  s = s.replace(/:\d*$/, '');
  s = s.replace(/\.+$/, '');
  if (s.startsWith('www.')) s = s.slice(4);
  return s;
}
export const host = (raw: string) => make('host', 'host:' + hostName(raw));

export const app = (certSha256: string) => make('app', 'app:' + certSha256.trim().toLowerCase());

export const acct = (account: string, ifsc: string) =>
  make('acct', 'acct:' + account.replace(/[^0-9]/g, '') + ':' + ifsc.trim().toUpperCase());

/** "account / ifsc" or "account:ifsc". */
export function acctCombined(raw: string): Indicator {
  const parts = raw.split(/[/:]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) throw new Error('acct needs account and IFSC');
  return acct(parts[0], parts[1]);
}

export function normalize(t: IndicatorType, raw: string): Indicator {
  switch (t) {
    case 'upi': return upi(raw);
    case 'tel': return tel(raw);
    case 'host': return host(raw);
    case 'app': return app(raw);
    case 'acct': return acctCombined(raw);
  }
}

/** Masked display label for a scam indicator, e.g. "UPI sbi.k***@ybl" (never the raw value). */
export function maskedLabel(t: IndicatorType, value: string): string {
  const v = value.replace(/^[a-z]+:/, '');
  switch (t) {
    case 'upi': {
      const [user, handle] = v.split('@');
      return `UPI ${user.slice(0, Math.min(5, Math.max(1, user.length - 2)))}***@${handle ?? ''}`;
    }
    case 'tel': return `Number ${v.slice(0, 2)}xxxxxx${v.slice(-2)}`;
    case 'host': {
      const parts = v.split('.');
      const tld = parts.pop() ?? '';
      const name = parts.join('.');
      return `Site ${name.slice(0, Math.min(6, Math.max(2, name.length - 4)))}***.${tld}`;
    }
    case 'app': return `App ${v.slice(0, 8)}…`;
    case 'acct': return `A/c ••••${v.split(':')[0].slice(-4)}`;
  }
}
