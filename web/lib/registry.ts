// Promise Cards a bank published from NYAYA (I1, Section 23.6), laid over the root-signed bundle.
// The gateway checks every published card the way a phone will: the signature against the bank's
// root-signed certificate, the bank id, and that only the official-channel lists changed. Phones
// then verify it again themselves (RegistryStore.verify), so a bad card can never reach a rule.
import { BUNDLE } from './bundle';
import { verifyHex } from './satya/crypto';
import { ruleBookFromCards, type RuleBook } from './satya/rules';
import type { BankEntry } from './satya/bundle';
import { readJson, update } from './store';

export interface PublishedCard { card_json: string; sig: string; version: number; published_at: string; published_by: string }
type Published = Record<string, PublishedCard>;

const PATH = 'cards.json';

/** The lists a bank may edit from the console. Promises change only through SATYA's registry review. */
export const EDITABLE = ['web_domains', 'extra_allowed_link_hosts', 'email_domains', 'sms_headers', 'service_1600', 'promo_140', 'inbound_helplines'] as const;
export type EditableList = (typeof EDITABLE)[number];

const ENTRY: Record<EditableList, RegExp> = {
  web_domains: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/,
  extra_allowed_link_hosts: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/,
  email_domains: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/,
  sms_headers: /^[A-Z0-9]{3,9}$/,
  service_1600: /^1600\d{4,8}$/,
  promo_140: /^140\d{4,8}$/,
  inbound_helplines: /^\d{3,15}$/,
};

export const rootCardOf = (bank: string) => BUNDLE.banks.find((b) => b.bank_id === bank)?.card ?? null;

export async function publishedCards(): Promise<Published> {
  return (await readJson<Published>(PATH).catch(() => null)) ?? {};
}

/** Every bank's entry as phones should receive it: the published card when there is one. */
export async function effectiveBanks(): Promise<BankEntry[]> {
  const pub = await publishedCards();
  return BUNDLE.banks.map((b) => {
    const p = pub[b.bank_id];
    return p ? { ...b, card: { card_json: p.card_json, sig: p.sig, signed_by: 'bank' as const, version: p.version } } : b;
  });
}

/** The rule book the gateway's Scam Check uses, built from the same cards phones receive. */
export async function effectiveRuleBook(): Promise<RuleBook> {
  const banks = await effectiveBanks();
  return ruleBookFromCards(JSON.parse(BUNDLE.global.card_json), banks.map((b) => JSON.parse(b.card.card_json)));
}

export type CardProblem = 'not_json' | 'wrong_bank' | 'bad_signature' | 'locked_field_changed' | 'bad_entry' | 'not_newer' | 'unknown_bank';

/** Everything a phone checks, plus the console's editing contract. Returns null when the card is good. */
export async function checkCard(bank: string, cardJson: string, sig: string, current: string, signPk = BUNDLE.banks.find((b) => b.bank_id === bank)?.cert.sign_pk): Promise<{ problem: CardProblem; field?: string } | null> {
  if (!signPk) return { problem: 'unknown_bank' };
  let next: any; let cur: any;
  try { next = JSON.parse(cardJson); cur = JSON.parse(current); } catch { return { problem: 'not_json' }; }
  if (!next || typeof next !== 'object' || next.bank_id !== bank) return { problem: 'wrong_bank' };
  if (!(await verifyHex(cardJson, sig, signPk))) return { problem: 'bad_signature' };
  const keys = new Set([...Object.keys(cur), ...Object.keys(next)]);
  for (const k of keys) {
    if (k === 'issued_at' || (EDITABLE as readonly string[]).includes(k)) continue;
    if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) return { problem: 'locked_field_changed', field: k };
  }
  for (const k of EDITABLE) {
    const v = next[k];
    if (!Array.isArray(v) || v.length > 50 || !v.every((x) => typeof x === 'string' && x.length <= 120 && ENTRY[k].test(x))) return { problem: 'bad_entry', field: k };
  }
  if (typeof next.issued_at !== 'string' || Number.isNaN(Date.parse(next.issued_at)) || next.issued_at <= cur.issued_at) return { problem: 'not_newer' };
  return null;
}

export async function publishCard(bank: string, cardJson: string, sig: string, user: string): Promise<PublishedCard> {
  const root = rootCardOf(bank)!;
  const now = new Date().toISOString();
  let saved: PublishedCard | null = null;
  await update<Published>(PATH, () => ({}), (pub) => {
    saved = { card_json: cardJson, sig, version: Math.max(root.version, pub[bank]?.version ?? 0) + 1, published_at: now, published_by: user };
    return { ...pub, [bank]: saved };
  });
  return saved!;
}

/** Back to the card SATYA signed with its root key. */
export async function resetCard(bank: string) {
  await update<Published>(PATH, () => ({}), (pub) => { const { [bank]: _gone, ...rest } = pub; return rest; });
}

