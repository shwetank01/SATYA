// libsodium helpers shared by the gateway (Node routes), scripts and the console (browser).
// Section 7.1: keys/signatures are lowercase hex; sealed boxes are STANDARD base64 with padding
// (libsodium-wrappers defaults to URL-safe without padding, which Kotlin's Base64 rejects).
import _sodium from 'libsodium-wrappers';
import { fromHex, sha256Hex, toHex } from './hash';

let ready: Promise<typeof _sodium> | null = null;
export function sodium(): Promise<typeof _sodium> {
  if (!ready) ready = _sodium.ready.then(() => _sodium);
  return ready;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function b64encode(bytes: Uint8Array): Promise<string> {
  const s = await sodium();
  return s.to_base64(bytes, s.base64_variants.ORIGINAL);
}
export async function b64decode(b64: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.from_base64(b64, s.base64_variants.ORIGINAL);
}

export interface SignKeyPair { pk: string; sk: string } // sk = 64-byte libsodium secret (seed || pk), hex
export interface BoxKeyPair { pk: string; sk: string }

export async function signKeypair(seedHex?: string): Promise<SignKeyPair> {
  const s = await sodium();
  const kp = seedHex ? s.crypto_sign_seed_keypair(fromHex(seedHex)) : s.crypto_sign_keypair();
  return { pk: toHex(kp.publicKey), sk: toHex(kp.privateKey) };
}
export async function boxKeypair(seedHex?: string): Promise<BoxKeyPair> {
  const s = await sodium();
  const kp = seedHex ? s.crypto_box_seed_keypair(fromHex(seedHex)) : s.crypto_box_keypair();
  return { pk: toHex(kp.publicKey), sk: toHex(kp.privateKey) };
}

/** Sign the exact UTF-8 bytes of `message` (never a re-serialised object). Returns hex. */
export async function signHex(message: string, skHex: string): Promise<string> {
  const s = await sodium();
  return toHex(s.crypto_sign_detached(enc.encode(message), fromHex(skHex)));
}
export async function verifyHex(message: string, sigHex: string, pkHex: string): Promise<boolean> {
  const s = await sodium();
  if (!/^[0-9a-f]{128}$/.test(sigHex) || !/^[0-9a-f]{64}$/.test(pkHex)) return false;
  try {
    return s.crypto_sign_verify_detached(fromHex(sigHex), enc.encode(message), fromHex(pkHex));
  } catch {
    return false;
  }
}

export async function seal(plaintext: Uint8Array | string, boxPkHex: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_box_seal(typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext, fromHex(boxPkHex));
}
export async function sealB64(plaintext: Uint8Array | string, boxPkHex: string): Promise<string> {
  return b64encode(await seal(plaintext, boxPkHex));
}
export async function openSealed(sealed: Uint8Array, boxPkHex: string, boxSkHex: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_box_seal_open(sealed, fromHex(boxPkHex), fromHex(boxSkHex));
}
export async function openSealedB64Text(sealedB64: string, boxPkHex: string, boxSkHex: string): Promise<string> {
  return dec.decode(await openSealed(await b64decode(sealedB64), boxPkHex, boxSkHex));
}

// --- Signed message formats (Section 7.4), exact strings ---
export const certMessage = (bankId: string, signPk: string, boxPk: string | null | undefined) => `satya-cert-v1|${bankId}|${signPk}|${boxPk ?? ''}`;
export const receiptMessage = (reportId: string, sealedHash: string, receivedAt: string) => `satya-receipt-v1|${reportId}|${sealedHash}|${receivedAt}`;
export const payReceiptMessage = (checkId: string, requestHash: string, decision: string, decidedAt: string) => `satya-paycheck-v1|${checkId}|${requestHash}|${decision}|${decidedAt}`;
export const doctorMessage = (plaintextSha256: string) => `satya-doctor-v1|${plaintextSha256}`;
export const sealedHashOf = (sealedBytes: Uint8Array) => sha256Hex(sealedBytes);
export const randomHex = async (n: number) => toHex((await sodium()).randombytes_buf(n));
