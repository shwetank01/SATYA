// Builds the Registry Bundle (Section 9.2) from the database. Same builder as the Android asset.
import { buildBundle, type BlockItem, type RegistryBundle } from './satya/bundle';
import { db } from './gateway';

export async function bundleFromDb(): Promise<RegistryBundle> {
  const [orgs, cards, blocked] = await Promise.all([
    db().from('orgs').select('id,name,type,sign_pk,box_pk,cert_sig').eq('type', 'bank').neq('id', 'DOCTOR').order('id'),
    db().from('promise_cards').select('org_id,card_json,sig,signed_by,version'),
    db().from('indicators').select('hash,type,confirmed_by,label').not('confirmed_by', 'is', null).limit(5000),
  ]);
  if (orgs.error || cards.error || blocked.error) throw new Error('db_read_failed');
  const byOrg = new Map((cards.data ?? []).map((c: any) => [c.org_id, c]));
  const global = byOrg.get('GLOBAL');
  if (!global) throw new Error('no_global_card');
  const banks = (orgs.data ?? [])
    .filter((o: any) => byOrg.has(o.id) && o.sign_pk && o.cert_sig)
    .map((o: any) => {
      const c = byOrg.get(o.id)!;
      return {
        bank_id: o.id, name: o.name, sign_pk: o.sign_pk, box_pk: o.box_pk ?? '', cert_sig: o.cert_sig,
        card: { card_json: c.card_json, sig: c.sig, signed_by: c.signed_by, version: c.version },
      };
    });
  const blocklist: BlockItem[] = (blocked.data ?? [])
    .filter((b: any) => ['upi', 'tel', 'host', 'app'].includes(b.type))
    .map((b: any) => ({ h: b.hash, t: b.type, by: b.confirmed_by, label: b.label ?? '' }));
  return buildBundle({ globalCard: { card_json: global.card_json, sig: global.sig }, banks, blocklist });
}
