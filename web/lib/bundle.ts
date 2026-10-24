// The signed Registry Bundle shipped with the gateway: the same file as the Android first-run asset
// (scripts/build-bundle.ts writes both). The gateway adds the live blocklist when it serves it.
import bundle from './data/registry_bundle.json';
import { ruleBookFromCards, type PromiseDef, type RuleBook } from './satya/rules';
import type { RegistryBundle } from './satya/bundle';

export const BUNDLE = bundle as unknown as RegistryBundle;

export const BANK_NAMES: Record<string, string> = Object.fromEntries(BUNDLE.banks.map((b) => [b.bank_id, b.name]));

/** Box public key a bank receives reports with (from its root-signed certificate). */
export const boxKeyOf = (bank: string) => BUNDLE.banks.find((b) => b.bank_id === bank)?.cert.box_pk || null;

const globalCard = JSON.parse(BUNDLE.global.card_json);
const bankCards = BUNDLE.banks.map((b) => JSON.parse(b.card.card_json));

export const RULE_BOOK: RuleBook = ruleBookFromCards(globalCard, bankCards);

export const PROMISES: Record<string, PromiseDef & { issuer: string }> = Object.fromEntries([
  ...(globalCard.promises as PromiseDef[]).map((p) => [p.id, { ...p, issuer: 'GLOBAL' }]),
  ...bankCards.flatMap((c: any) => (c.promises as PromiseDef[]).map((p) => [p.id, { ...p, issuer: c.bank_id }])),
]);
