// Appendix D: deterministic Ed25519 + X25519 vectors and the sealed-box round trip.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { b64decode, boxKeypair, certMessage, openSealed, sealB64, signHex, signKeypair, verifyHex } from '../lib/satya/crypto';

const v = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'spec', 'crypto_vectors.json'), 'utf8'));

describe('Appendix D', () => {
  it('ed25519 seed keypair', async () => {
    const kp = await signKeypair(v.ed25519.seed_hex);
    expect(kp.pk).toBe(v.ed25519.pk_hex);
    expect(kp.sk).toBe(v.ed25519.sk64_hex);
  });
  it('ed25519 signature is deterministic and verifies', async () => {
    expect(await signHex(v.ed25519.message_utf8, v.ed25519.sk64_hex)).toBe(v.ed25519.signature_hex);
    expect(await verifyHex(v.ed25519.message_utf8, v.ed25519.signature_hex, v.ed25519.pk_hex)).toBe(true);
    expect(await verifyHex(v.ed25519.message_utf8 + 'x', v.ed25519.signature_hex, v.ed25519.pk_hex)).toBe(false);
  });
  it('certificate message format', async () => {
    const msg = certMessage('SBI', v.ed25519.pk_hex, '');
    expect(msg).toBe(v.ed25519.cert_message_utf8);
    expect(await signHex(msg, v.ed25519.sk64_hex)).toBe(v.ed25519.cert_signature_hex);
  });
  it('x25519 seed keypair', async () => {
    const kp = await boxKeypair(v.x25519_seed_keypair.seed_hex);
    expect(kp.pk).toBe(v.x25519_seed_keypair.pk_hex);
    expect(kp.sk).toBe(v.x25519_seed_keypair.sk_hex);
  });
  it('sealed box round trip, standard base64, +48 bytes', async () => {
    const b64 = await sealB64('satya-doctor', v.x25519_seed_keypair.pk_hex);
    expect(b64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    const bytes = await b64decode(b64);
    expect(bytes.length).toBe(60);
    const opened = await openSealed(bytes, v.x25519_seed_keypair.pk_hex, v.x25519_seed_keypair.sk_hex);
    expect(new TextDecoder().decode(opened)).toBe('satya-doctor');
  });
});
