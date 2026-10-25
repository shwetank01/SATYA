// Pay Check (Section 14.4), a port of spec/reference/pay_ref.py. Runs in the company's browser.
import { sha256Hex } from './hash';

export type PayFlag = 'NEW_ACCOUNT' | 'APPROVER_UNKNOWN' | 'APPROVER_LIMIT' | 'WRONG_CHANNEL' | 'OVER_LIMIT' | 'URGENT_SECRET' | 'SYNTHETIC_VOICE' | 'NO_ACCOUNT_FOUND';
export type PayChannel = 'email' | 'in_person' | 'whatsapp' | 'call' | 'voice_note';

export const FLAG_SEVERITY: Record<PayFlag, 'critical' | 'high' | 'medium' | 'info'> = {
  NEW_ACCOUNT: 'critical', APPROVER_UNKNOWN: 'high', APPROVER_LIMIT: 'high', WRONG_CHANNEL: 'high',
  OVER_LIMIT: 'medium', URGENT_SECRET: 'high', SYNTHETIC_VOICE: 'high', NO_ACCOUNT_FOUND: 'info',
};

export const FLAG_REASON: Record<PayFlag, string> = {
  NEW_ACCOUNT: 'The account and IFSC in the request do not match any saved vendor.',
  APPROVER_UNKNOWN: 'The requester is not on the approver list.',
  APPROVER_LIMIT: 'The amount is above what this approver may authorise.',
  WRONG_CHANNEL: 'Payment requests are not accepted over this channel.',
  OVER_LIMIT: 'The amount is above the company threshold for a callback.',
  URGENT_SECRET: 'The request is both urgent and secret, the classic CEO-fraud pressure.',
  SYNTHETIC_VOICE: 'The voice note scored above the synthetic-voice threshold (a signal, not proof).',
  NO_ACCOUNT_FOUND: 'No account number was found in the request.',
};

export const URG = ['urgent', 'urgently', 'immediately', 'asap', 'right away', 'today itself', 'turant', 'jaldi', 'abhi'];
export const SEC = ['confidential', 'secret', "don't tell", 'dont tell', 'do not tell', 'keep it quiet', 'between us', 'kisi ko mat batana', 'mat batana'];

export interface Vendor { vendor_name: string; account?: string; ifsc?: string; acct_hash?: string }
export interface Approver { name: string; role: string; callback_phone: string; max_amount_inr: number }
export interface PayRules { threshold_inr: number; allowed_channels: string[]; vendors: Vendor[]; approvers: Approver[] }
export interface PayRequest { requester: string; channel: PayChannel | string; text: string; voice_score?: number | null }
export interface PayResult { amount: number | null; flags: PayFlag[]; decision: 'hold' | 'clear'; accounts: { account: string; ifsc: string; known: boolean }[] }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const acctKey = (acc: string, ifsc: string) => 'acct:' + acc.replace(/\D/g, '') + ':' + ifsc.toUpperCase();
export const vendorHash = (v: Vendor) => v.acct_hash ?? sha256Hex(acctKey(v.account ?? '', v.ifsc ?? ''));

export const hasAny = (t: string, words: string[]) => words.some((w) => new RegExp(`(?<![a-z])${escapeRe(w)}(?![a-z])`).test(t));

/** Python round() is banker's rounding; only differs at exact .5, kept for parity. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export function amounts(text: string): number | null {
  const t = text.toLowerCase();
  const out: number[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l|crores?|cr)\b/g)) out.push(pyRound(parseFloat(m[1]) * (m[2].startsWith('c') ? 1e7 : 1e5)));
  for (const m of t.matchAll(/(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)/g)) out.push(pyRound(parseFloat(m[1].replace(/,/g, ''))));
  return out.length ? Math.max(...out) : null;
}

export function accounts(text: string): { account: string; ifsc: string }[] {
  const accs = text.match(/(?<!\d)\d{9,18}(?!\d)/g) ?? [];
  const ifsc = text.toUpperCase().match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g) ?? [];
  return accs.map((a) => ({ account: a, ifsc: ifsc[0] ?? '' }));
}

export function payCheck(rules: PayRules, c: PayRequest, voiceThreshold: number): PayResult {
  const flags: PayFlag[] = [];
  const text = c.text;
  const amt = amounts(text);
  const vend = new Set(rules.vendors.map(vendorHash));
  const accs = accounts(text).map((a) => ({ ...a, known: vend.has(sha256Hex(acctKey(a.account, a.ifsc))) }));
  if (!accs.length) flags.push('NO_ACCOUNT_FOUND');
  else if (accs.some((a) => !a.known)) flags.push('NEW_ACCOUNT');
  const appr = rules.approvers.filter((a) => a.name === c.requester);
  if (!appr.length) flags.push('APPROVER_UNKNOWN');
  else if (amt !== null && amt > appr[0].max_amount_inr) flags.push('APPROVER_LIMIT');
  if (!rules.allowed_channels.includes(c.channel)) flags.push('WRONG_CHANNEL');
  if (amt !== null && amt > rules.threshold_inr) flags.push('OVER_LIMIT');
  const t = text.toLowerCase();
  if (hasAny(t, URG) && hasAny(t, SEC)) flags.push('URGENT_SECRET');
  if (c.voice_score !== null && c.voice_score !== undefined && c.voice_score >= voiceThreshold) flags.push('SYNTHETIC_VOICE');
  flags.sort();
  const decision = flags.some((f) => FLAG_SEVERITY[f] === 'critical' || FLAG_SEVERITY[f] === 'high') ? 'hold' : 'clear';
  return { amount: amt, flags, decision, accounts: accs };
}

// ---------------------------------------------------------------- network flags (Section 23.7)
// What the SATYA network already knows about where the money would go. Added in the console after
// payCheck(), so the Appendix E vectors (and pay_ref.py) are unchanged.

export type NetworkFlag = 'NETWORK_BLOCKED' | 'NETWORK_REPORTED';
export type AnyPayFlag = PayFlag | NetworkFlag;

export const NETWORK_SEVERITY: Record<NetworkFlag, 'critical' | 'high'> = { NETWORK_BLOCKED: 'critical', NETWORK_REPORTED: 'high' };

export const NETWORK_REASON: Record<NetworkFlag, string> = {
  NETWORK_BLOCKED: 'A bank on SATYA has confirmed this account or UPI ID as fake.',
  NETWORK_REPORTED: 'SATYA users have reported this account or UPI ID in scam messages.',
};

export const severityOf = (f: AnyPayFlag) => (f in NETWORK_SEVERITY ? NETWORK_SEVERITY[f as NetworkFlag] : FLAG_SEVERITY[f as PayFlag]);
export const reasonOf = (f: AnyPayFlag) => (f in NETWORK_REASON ? NETWORK_REASON[f as NetworkFlag] : FLAG_REASON[f as PayFlag]);
export const holds = (flags: AnyPayFlag[]) => flags.some((f) => severityOf(f) === 'critical' || severityOf(f) === 'high');

/** UPI IDs in a payment request; an email address (handle followed by .tld) is not one. */
export function upiIds(text: string): string[] {
  return [...new Set(text.match(/[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}(?![\p{L}\p{N}_]|\.[A-Za-z])/gu) ?? [])];
}
