// Generate (or load) every SATYA key pair. Idempotent: existing keys are never replaced.
//   keys/root.json       SATYA Root (Ed25519). Signs bank certificates and starter cards. Laptop only.
//   keys/server.json     Receipt signing key (Ed25519), Doctor box (X25519), APP_KEY.
//   keys/demo_keys.json  Per-org Sign + Box keys; imported into the console browser (never committed).
// Secrets are written to gitignored files only; this script prints public values and file paths.
import fs from 'node:fs';
import path from 'node:path';
import { boxKeypair, randomHex, signKeypair, type BoxKeyPair, type SignKeyPair } from '../lib/satya/crypto';

export const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');
export const KEYS_DIR = path.join(ROOT_DIR, 'keys');
export const BANKS = ['SBI', 'HDFC', 'ICICI', 'AXIS', 'PNB'] as const;

export interface RootKeys { root: SignKeyPair }
export interface ServerKeys { receipt: SignKeyPair; doctor_box: BoxKeyPair; app_key: string; ai_api_key: string; install_note: string }
export type OrgKeys = Record<string, { sign: SignKeyPair; box: BoxKeyPair | null }>;

function readJson<T>(f: string): T | null {
  const p = path.join(KEYS_DIR, f);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as T) : null;
}
function writeJson(f: string, v: unknown) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(path.join(KEYS_DIR, f), JSON.stringify(v, null, 2) + '\n', { mode: 0o600 });
}

export async function loadOrCreateKeys(): Promise<{ root: RootKeys; server: ServerKeys; orgs: OrgKeys; created: string[] }> {
  const created: string[] = [];
  let root = readJson<RootKeys>('root.json');
  if (!root) { root = { root: await signKeypair() }; writeJson('root.json', root); created.push('root.json'); }

  let server = readJson<ServerKeys>('server.json');
  if (!server) {
    server = {
      receipt: await signKeypair(),
      doctor_box: await boxKeypair(),
      app_key: await randomHex(32),
      ai_api_key: 'satya-ai-' + (await randomHex(24)),
      install_note: 'APP_KEY is shared by gateway, VIVEK and the app build. ai_api_key protects the satya-ai Cloudflare Worker.',
    };
    writeJson('server.json', server);
    created.push('server.json');
  }

  let orgs = readJson<OrgKeys>('demo_keys.json');
  if (!orgs) orgs = {};
  let changed = false;
  for (const id of [...BANKS, 'DOCTOR']) {
    if (!orgs[id]) {
      orgs[id] = {
        sign: await signKeypair(),
        // DOCTOR's box key is the server's Doctor box so C4 can open what it seals.
        box: id === 'DOCTOR' ? server.doctor_box : await boxKeypair(),
      };
      changed = true;
    }
  }
  if (changed) { writeJson('demo_keys.json', orgs); created.push('demo_keys.json'); }
  return { root, server, orgs, created };
}

export function writeEnvFiles(k: { root: RootKeys; server: ServerKeys }, extra: Record<string, string> = {}) {
  // web/.env.local (gitignored). Supabase values are merged in by provisioning, never overwritten here.
  const envPath = path.join(ROOT_DIR, 'web', '.env.local');
  const env: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  Object.assign(env, {
    SATYA_APP_KEY: k.server.app_key,
    SATYA_RECEIPT_SK: k.server.receipt.sk,
    SATYA_RECEIPT_PK: k.server.receipt.pk,
    SATYA_ROOT_PK: k.root.root.pk,
    SATYA_DOCTOR_BOX_SK: k.server.doctor_box.sk,
    SATYA_DOCTOR_BOX_PK: k.server.doctor_box.pk,
    NEXT_PUBLIC_SATYA_ROOT_PK: k.root.root.pk,
    ...extra,
  });
  fs.writeFileSync(envPath, Object.entries(env).map(([a, b]) => `${a}=${b}`).join('\n') + '\n', { mode: 0o600 });

  // android/secrets.properties (gitignored): public keys + APP_KEY + URLs.
  const propsPath = path.join(ROOT_DIR, 'android', 'secrets.properties');
  const props: Record<string, string> = {};
  if (fs.existsSync(propsPath)) {
    for (const line of fs.readFileSync(propsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) props[m[1]] = m[2];
    }
  }
  Object.assign(props, {
    GATEWAY_URL: props.GATEWAY_URL || 'https://satya-gateway.vercel.app',
    VIVEK_URL: props.VIVEK_URL || 'https://satya-gateway.vercel.app/api/vivek-unset',
    APP_KEY: k.server.app_key,
    ROOT_PK: k.root.root.pk,
    RECEIPT_PK: k.server.receipt.pk,
    DOCTOR_BOX_PK: k.server.doctor_box.pk,
  });
  fs.writeFileSync(propsPath, Object.entries(props).map(([a, b]) => `${a}=${b}`).join('\n') + '\n', { mode: 0o600 });
  return { envPath, propsPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const k = await loadOrCreateKeys();
  const files = writeEnvFiles(k);
  console.log(k.created.length ? `created: ${k.created.join(', ')}` : 'keys already exist (unchanged)');
  console.log('ROOT_PK     ', k.root.root.pk);
  console.log('RECEIPT_PK  ', k.server.receipt.pk);
  console.log('DOCTOR_BOX_PK', k.server.doctor_box.pk);
  console.log('wrote', path.relative(ROOT_DIR, files.envPath), 'and', path.relative(ROOT_DIR, files.propsPath), '(gitignored)');
}
