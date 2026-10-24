// PRAHARI rules engine, a port of spec/reference/rules_ref.py evaluate(). The phone is the judge;
// this TypeScript copy powers the console's Promise Card preview and is held to the same vectors.
import { EMAIL, LINK, UPI, re } from './rx';

export type SeverityWire = 'none' | 'medium' | 'high' | 'critical';
export type ChannelWire = 'sms' | 'call' | 'whatsapp' | 'email' | 'screen' | 'video' | 'voice' | 'app';

export interface CheckSpec {
  type: string;
  values?: string[];
  values_hi?: string[];
  allowed_suffixes?: string[];
  prefixes?: string[];
  if_plain_10_digit_mobile?: SeverityWire;
  if_1600_used_for_selling?: SeverityWire;
}

export interface PromiseDef {
  id: string;
  promise: string;
  promise_hi?: string;
  check: CheckSpec;
  if_broken: SeverityWire;
  kill_chain_stage?: number;
  source?: string;
  source_doc?: string;
  source_note?: string;
  verified?: boolean;
}

export interface BankRules {
  id: string;
  extraAllowedLinkHosts: string[];
  promises: PromiseDef[];
}

export interface RuleBook {
  global: PromiseDef[];
  banks: BankRules[];
}

const p = (...phrases: string[]) => phrases.map((x) => x.split(' '));
export const ALIASES: [string, string[][]][] = [
  ['SBI', p('sbi', 'state bank', 'yono')],
  ['HDFC', p('hdfc')],
  ['ICICI', p('icici', 'imobile')],
  ['AXIS', p('axis')],
  ['PNB', p('pnb', 'punjab national')],
];
export const ASK_VERBS = p('share', 'send', 'tell', 'give', 'provide', 'enter', 'forward', 'read', 'type', 'batao', 'bata', 'bataye', 'bataiye', 'bhejo', 'bhej', 'dijiye', 'de do', 'karo', 'bolo', 'बताओ', 'बताइए', 'भेजो', 'दीजिए');
export const INSTALL_VERBS = p('install', 'download', 'kholo', 'open', 'use', 'lagao', 'daalo', 'इंस्टॉल', 'डाउनलोड');
export const TRANSFER_VERBS = p('move', 'transfer', 'send', 'shift', 'deposit', 'bhejo', 'daal', 'dalo', 'daalo', 'jama');
export const CALL_VERBS = p('call', 'callback', 'dial', 'contact', 'phone', 'sampark');
export const PAY_VERBS = p('pay', 'send', 'transfer', 'deposit', 'bharo', 'bhar', 'bhariye', 'bhejo', 'jama', 'भरें', 'भरो', 'भेजें', 'भेजो', 'जमा');
export const NEG = new Set(['not', 'never', 'dont', 'don', 'mat', 'na', 'nahi', 'nahin', 'kabhi', 'नहीं', 'मत']);
export const SALES = p('offer', 'pre approved', 'preapproved', 'loan', 'interested', 'limit increase', 'cashback');
export const KYC = p('kyc', 'ekyc', 'rekyc', 're kyc', 'update pan', 'pan update', 'aadhaar update', 'केवाईसी');
export const HEADER_CODES: [string, string[]][] = [
  ['SBI', ['SBIINB', 'SBIPSG', 'SBICRD', 'SBI']],
  ['HDFC', ['HDFCBK', 'HDFCBN', 'HDFC']],
  ['ICICI', ['ICICIB', 'ICICI']],
  ['AXIS', ['AXISBK', 'AXIS']],
  ['PNB', ['PNBSMS', 'PNB']],
];
const WINDOW = 6;

const R_TOK = /[a-z0-9ऀ-ॿ]+/g;
const R_EMAIL = re(EMAIL);
const R_UPI = re(UPI);
const R_LINK = re(LINK, 'giu');
const R_HEADER = /^([A-Z]{2}-)?(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,11}(-[STPG])?$/;

export const toks = (t: string): string[] => t.toLowerCase().match(R_TOK) ?? [];
export function find(tk: string[], phrase: string[]): number[] {
  const out: number[] = [];
  const n = phrase.length;
  for (let i = 0; i <= tk.length - n; i++) if (phrase.every((w, j) => tk[i + j] === w)) out.push(i);
  return out;
}
export const finds = (tk: string[], phrases: string[][]) => phrases.flatMap((ph) => find(tk, ph));
const negated = (tk: string[], i: number) => tk.slice(Math.max(0, i - 3), i).some((w) => NEG.has(w));
export const verbs = (tk: string[], phrases: string[][]) => finds(tk, phrases).filter((i) => !negated(tk, i));
function secretHits(tk: string[], values: string[]): number[] {
  const occ: number[] = [];
  for (const v of values) {
    const ph = toks(v);
    for (const i of find(tk, ph)) {
      if (ph.length === 1 && ph[0] === 'pin' && i + 1 < tk.length && tk[i + 1] === 'code') continue;
      occ.push(i);
    }
  }
  return occ;
}
const near = (a: number[], b: number[], w = WINDOW) => a.some((x) => b.some((y) => Math.abs(x - y) <= w));
export const stripIds = (text: string) => text.replace(R_EMAIL, ' ').replace(R_UPI, ' ');
export const hosts = (text: string) => [...stripIds(text).matchAll(R_LINK)].map((m) => m[1].toLowerCase());
export const digits = (s: string) => s.toLowerCase().replace(/[^0-9x]/g, '');
export function national(s: string): string {
  let d = digits(s);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const plainMobile = (s: string) => /^[6-9][0-9x]{9}$/.test(national(s));
export const isHeader = (s: string) => R_HEADER.test(s.trim().toUpperCase());
export function claimed(tk: string[], sender = ''): string | null {
  for (const [b, al] of ALIASES) if (finds(tk, al).length) return b;
  if (isHeader(sender)) {
    const parts = sender.trim().toUpperCase().split('-');
    const core = parts.length > 1 ? parts[1] : parts[0];
    for (const [b, codes] of HEADER_CODES) if (codes.some((c) => core.startsWith(c))) return b;
  }
  return null;
}
function askContains(tk: string[], ck: CheckSpec): boolean {
  const vals = ck.values ?? [];
  const hi = ck.values_hi ?? [];
  if (hi.some((h) => toks(h).length > 1 && find(tk, toks(h)).length)) return true;
  const sec = secretHits(tk, [...vals, ...hi.filter((h) => toks(h).length === 1)]);
  return sec.length > 0 && near(sec, verbs(tk, ASK_VERBS));
}
const phraseOcc = (tk: string[], values: string[] = []) => values.flatMap((v) => find(tk, toks(v)));

export interface EvalInput { text: string; channel: ChannelWire; sender?: string; bankOverride?: string | null }
export interface EvalResult { bank: string | null; hits: [string, SeverityWire][] }

export function evaluate(book: RuleBook, c: EvalInput): EvalResult {
  const text = c.text ?? '';
  const ch = c.channel;
  const sender = c.sender ?? '';
  const tk = toks(text);
  const bank = c.bankOverride ?? claimed(tk, sender);
  const hits: [string, SeverityWire][] = [];
  for (const g of book.global) {
    const ck = g.check;
    const t = ck.type;
    if (t === 'ask_contains_any' && askContains(tk, ck)) hits.push([g.id, g.if_broken]);
    if (t === 'asks_install_any') { const occ = phraseOcc(tk, ck.values); if (occ.length && near(occ, verbs(tk, INSTALL_VERBS))) hits.push([g.id, g.if_broken]); }
    if (t === 'asks_transfer_with_phrase') { const occ = phraseOcc(tk, ck.values); if (occ.length && near(occ, verbs(tk, TRANSFER_VERBS), 8)) hits.push([g.id, g.if_broken]); }
    if (t === 'asks_fee_with_phrase') { const occ = phraseOcc(tk, ck.values); if (occ.length && near(occ, verbs(tk, PAY_VERBS))) hits.push([g.id, g.if_broken]); }
    if (!bank) continue;
    const bk = book.banks.find((b) => b.id === bank);
    if (!bk) continue;
    if (t === 'link_host_suffix') {
      const allowed = ck.allowed_suffixes ?? [];
      const extra = bk.extraAllowedLinkHosts;
      for (const h of hosts(text)) {
        if (!(allowed.some((s) => h.endsWith(s)) || extra.some((e) => h === e || h.endsWith('.' + e)))) { hits.push([g.id, g.if_broken]); break; }
      }
    }
    if (t === 'caller_prefix' && (ch === 'call' || ch === 'whatsapp')) {
      if (plainMobile(sender)) hits.push([g.id, ck.if_plain_10_digit_mobile ?? g.if_broken]);
      else if (national(sender).startsWith('1600') && finds(tk, SALES).length) hits.push([g.id, ck.if_1600_used_for_selling ?? g.if_broken]);
    }
    if (t === 'message_asks_callback_to_prefix') {
      const nums = tk.map((w, i) => (/^\p{Nd}+$/u.test(w) && (ck.prefixes ?? []).some((pf) => w.startsWith(pf)) ? i : -1)).filter((i) => i >= 0);
      if (nums.length && near(nums, verbs(tk, CALL_VERBS))) hits.push([g.id, g.if_broken]);
    }
    if (t === 'sms_sender_is_header' && ch === 'sms' && !isHeader(sender)) hits.push([g.id, g.if_broken]);
  }
  for (const bk of book.banks) {
    for (const pr of bk.promises) {
      const ck = pr.check;
      const t = ck.type;
      if (t === 'incoming_caller_in' && ch === 'call' && (ck.values ?? []).includes(national(sender))) hits.push([pr.id, pr.if_broken]);
      if (bk.id !== bank) continue;
      if (t === 'kyc_request_with_link' && finds(tk, KYC).length && hosts(text).length) hits.push([pr.id, pr.if_broken]);
      if (t === 'email_sender_domain_in' && ch === 'email') {
        const dom = sender.split('@').pop()!.toLowerCase();
        if (!(ck.values ?? []).some((v) => dom === v || dom.endsWith('.' + v))) hits.push([pr.id, pr.if_broken]);
      }
      if (t === 'ask_contains_any' && askContains(tk, ck)) hits.push([pr.id, pr.if_broken]);
    }
  }
  const uniq = [...new Map(hits.map((h) => [h.join('|'), h])).values()];
  uniq.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return { bank, hits: uniq };
}

/** Registry JSON (spec/satya_bank_promises.json) -> RuleBook. */
export function ruleBookFromRegistry(reg: any): RuleBook {
  return {
    global: reg.global_promises,
    banks: reg.banks.map((b: any) => ({ id: b.id, extraAllowedLinkHosts: b.extra_allowed_link_hosts?.values ?? [], promises: b.extra_promises ?? [] })),
  };
}

/** Verified card_json objects (Section 9.1) -> RuleBook. */
export function ruleBookFromCards(globalCard: any, bankCards: any[]): RuleBook {
  return {
    global: globalCard.promises,
    banks: bankCards.map((c) => ({ id: c.bank_id, extraAllowedLinkHosts: c.extra_allowed_link_hosts ?? [], promises: c.promises ?? [] })),
  };
}
