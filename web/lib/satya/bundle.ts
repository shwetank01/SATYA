// Promise Cards and the Registry Bundle (Sections 9.1, 9.2). One builder for the seed script,
// the /api/v1/registry route and the Android first-run asset, so they can never disagree.
import { certMessage, signHex, verifyHex } from './crypto';

export interface SignedCard { card_json: string; sig: string; signed_by: 'bank' | 'satya_root'; version: number }
export interface BankEntry { bank_id: string; name: string; cert: { sign_pk: string; box_pk: string; cert_sig: string }; card: SignedCard }
export interface BlockItem { h: string; t: 'upi' | 'tel' | 'host' | 'app' | 'acct'; by: string; label: string }
export interface RegistryBundle { v: 1; generated_at: string; global: { card_json: string; sig: string; signed_by: 'satya_root' }; banks: BankEntry[]; blocklist: BlockItem[] }

const vals = (o: any): string[] => (Array.isArray(o) ? o : o?.values ?? []);

/** Card JSON strings are built once with a fixed key order; the string is what gets signed and stored. */
export function bankCardJson(bank: any, issuedAt: string): string {
  return JSON.stringify({
    v: 1,
    bank_id: bank.id,
    name: bank.name,
    name_hi: bank.name_hi ?? null,
    issued_at: issuedAt,
    web_domains: vals(bank.web_domains),
    extra_allowed_link_hosts: vals(bank.extra_allowed_link_hosts),
    email_domains: vals(bank.email_domains),
    email_senders: vals(bank.email_senders),
    sms_headers: vals(bank.sms_headers),
    service_1600: vals(bank.service_1600),
    promo_140: vals(bank.promo_140),
    inbound_helplines: vals(bank.inbound_helplines),
    official_apps: (bank.official_apps ?? []).map((a: any) => ({ name: a.name, package: a.package ?? null, cert_sha256: a.cert_sha256 ?? null })),
    promises: bank.extra_promises ?? [],
    report_to: bank.report_to ?? null,
  });
}

export function globalCardJson(registry: any, issuedAt: string): string {
  return JSON.stringify({
    v: 1,
    bank_id: 'GLOBAL',
    issued_at: issuedAt,
    promises: registry.global_promises,
    report_channels: registry.report_channels_india ?? [],
    upi_apps: registry.upi_apps ?? [],
  });
}

export const issuedAtOf = (registry: any) => `${registry.updated_at ?? '2026-10-24'}T00:00:00.000Z`;

export async function signCert(bankId: string, signPk: string, boxPk: string | null, rootSk: string) {
  return { sign_pk: signPk, box_pk: boxPk ?? '', cert_sig: await signHex(certMessage(bankId, signPk, boxPk), rootSk) };
}

export async function buildBundle(opts: {
  globalCard: { card_json: string; sig: string };
  banks: { bank_id: string; name: string; sign_pk: string; box_pk: string | null; cert_sig: string; card: SignedCard }[];
  blocklist: BlockItem[];
  generatedAt?: string;
}): Promise<RegistryBundle> {
  return {
    v: 1,
    generated_at: opts.generatedAt ?? new Date().toISOString(),
    global: { card_json: opts.globalCard.card_json, sig: opts.globalCard.sig, signed_by: 'satya_root' },
    banks: opts.banks.map((b) => ({ bank_id: b.bank_id, name: b.name, cert: { sign_pk: b.sign_pk, box_pk: b.box_pk ?? '', cert_sig: b.cert_sig }, card: b.card })),
    blocklist: opts.blocklist,
  };
}

/** Phone-side verification order (Section 8.7), used by the Doctor CLI (C2) and tests. */
export async function verifyBundle(bundle: RegistryBundle, rootPk: string): Promise<{ ok: boolean; problems: string[]; cards: number }> {
  const problems: string[] = [];
  let cards = 0;
  if (await verifyHex(bundle.global.card_json, bundle.global.sig, rootPk)) cards++;
  else problems.push('GLOBAL card signature');
  try { JSON.parse(bundle.global.card_json); } catch { problems.push('GLOBAL card JSON'); }
  for (const b of bundle.banks) {
    const certOk = await verifyHex(certMessage(b.bank_id, b.cert.sign_pk, b.cert.box_pk), b.cert.cert_sig, rootPk);
    if (!certOk) { problems.push(`${b.bank_id} certificate`); continue; }
    const signer = b.card.signed_by === 'satya_root' ? rootPk : b.cert.sign_pk;
    if (!(await verifyHex(b.card.card_json, b.card.sig, signer))) { problems.push(`${b.bank_id} card signature`); continue; }
    try {
      const card = JSON.parse(b.card.card_json);
      if (card.bank_id !== b.bank_id) { problems.push(`${b.bank_id} card bank_id mismatch`); continue; }
    } catch { problems.push(`${b.bank_id} card JSON`); continue; }
    cards++;
  }
  return { ok: problems.length === 0, problems, cards };
}
