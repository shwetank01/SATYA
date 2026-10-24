// Section 7.2: sha256 hex, prefixes, day tokens, ticket hashes. Sync, works in the browser and in Node.
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';

const enc = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error('odd hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const sha256Bytes = (data: Uint8Array) => sha256(data);
export const sha256Hex = (data: string | Uint8Array) => toHex(sha256(typeof data === 'string' ? enc.encode(data) : data));
export const prefixOf = (hash: string) => hash.slice(0, 5);
export const hmacSha256Hex = (key: Uint8Array, msg: string) => toHex(hmac(sha256, key, enc.encode(msg)));
export const dayToken = (installSecret: Uint8Array, day: string, hash: string) => hmacSha256Hex(installSecret, `${day}|${hash}`);
export const ticketHash = (ticketHex: string) => sha256Hex(ticketHex);
