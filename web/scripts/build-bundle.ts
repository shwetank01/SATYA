// Build the signed Registry Bundle straight from spec/satya_bank_promises.json and keys/, without a
// database, and write it to the Android first-run asset. seed.ts uses the same builders and also
// stores everything in Supabase; this script exists so the app works offline from first install.
import fs from 'node:fs';
import path from 'node:path';
import { loadOrCreateKeys, ROOT_DIR, BANKS } from './gen-keys';
import { bankCardJson, buildBundle, globalCardJson, issuedAtOf, signCert, verifyBundle } from '../lib/satya/bundle';
import { signHex } from '../lib/satya/crypto';

export async function bundleFromRegistry() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'spec', 'satya_bank_promises.json'), 'utf8'));
  const k = await loadOrCreateKeys();
  const rootSk = k.root.root.sk;
  const issuedAt = issuedAtOf(registry);
  const g = globalCardJson(registry, issuedAt);
  const globalCard = { card_json: g, sig: await signHex(g, rootSk) };
  const banks = [];
  for (const id of BANKS) {
    const b = registry.banks.find((x: any) => x.id === id);
    const org = k.orgs[id];
    const cert = await signCert(id, org.sign.pk, org.box?.pk ?? null, rootSk);
    const cj = bankCardJson(b, issuedAt);
    banks.push({
      bank_id: id, name: b.name, sign_pk: cert.sign_pk, box_pk: cert.box_pk, cert_sig: cert.cert_sig,
      card: { card_json: cj, sig: await signHex(cj, rootSk), signed_by: 'satya_root' as const, version: 1 },
    });
  }
  return { registry, keys: k, globalCard, banks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { keys, globalCard, banks } = await bundleFromRegistry();
  const bundle = await buildBundle({ globalCard, banks, blocklist: [] });
  const v = await verifyBundle(bundle, keys.root.root.pk);
  if (!v.ok) throw new Error('bundle does not verify: ' + v.problems.join(', '));
  const out = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'registry_bundle.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bundle, null, 1) + '\n');
  console.log(`bundle OK: ${v.cards} cards verify against ROOT_PK -> ${path.relative(ROOT_DIR, out)}`);
}
