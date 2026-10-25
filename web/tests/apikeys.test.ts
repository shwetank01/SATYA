// Partner API keys against the same in-memory blob stand-in as tests/store.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const blobs = new Map<string, { body: string; etag: number }>();
let seq = 0;
vi.mock('@vercel/blob', () => {
  class BlobError extends Error {}
  class BlobPreconditionFailedError extends BlobError {}
  return {
    BlobError, BlobPreconditionFailedError,
    async get(p: string) { const b = blobs.get(p); if (!b) throw new BlobError('does not exist'); return { statusCode: 200, stream: new Response(b.body).body, blob: { etag: `"${b.etag}"` } }; },
    async put(p: string, body: string, o: { ifMatch?: string }) {
      const cur = blobs.get(p);
      if (o.ifMatch !== undefined && (!cur || `"${cur.etag}"` !== o.ifMatch)) throw new BlobPreconditionFailedError('precondition');
      if (o.ifMatch === undefined && cur) throw new BlobError('already exists');
      blobs.set(p, { body, etag: ++seq });
    },
    async del(p: string) { blobs.delete(p); },
  };
});

const { newKey, orgOfKey } = await import('../lib/apikeys');
const store = await import('../lib/store');

beforeEach(() => blobs.clear());

describe('partner API keys', () => {
  it('a key is 160 random bits, names its bank, and is stored only as a hash', async () => {
    const { key, row } = newKey('SBI', 'Asha Rao');
    expect(key).toMatch(/^nyaya_live_sbi_[0-9a-f]{40}$/);
    expect(row.prefix).toBe(key.slice(0, 19));
    await store.addApiKey('SBI', row);
    expect([...blobs.values()].some((b) => b.body.includes(key))).toBe(false);
    expect((await orgOfKey(`Bearer ${key}`))?.org).toBe('SBI');
  });

  it('refuses a revoked key, another bank’s key under a forged prefix, and junk', async () => {
    const { key, row } = newKey('HDFC', 'Asha Rao');
    await store.addApiKey('HDFC', row);
    expect(await orgOfKey(`Bearer ${key.replace('_hdfc_', '_sbi_')}`)).toBeNull();
    expect(await orgOfKey(`Bearer ${key.slice(0, -1)}0`)).toBeNull();
    expect(await orgOfKey('Basic abc')).toBeNull();
    expect(await orgOfKey(`Bearer nyaya_live_acme_${'0'.repeat(40)}`)).toBeNull(); // companies have no API keys
    await store.revokeApiKey('HDFC', row.id, 'Asha Rao');
    expect(await orgOfKey(`Bearer ${key}`)).toBeNull();
  });

  it('counts calls per bank per day', async () => {
    expect(await store.countCall('SBI', '2026-10-25')).toBe(1);
    expect(await store.countCall('SBI', '2026-10-25')).toBe(2);
    expect(await store.countCall('SBI', '2026-10-26')).toBe(1);
    expect(await store.usageOf('SBI', ['2026-10'])).toEqual({ '2026-10-25': 2, '2026-10-26': 1 });
  });
});
