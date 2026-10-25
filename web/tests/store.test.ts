// lib/store.ts against an in-memory stand-in for @vercel/blob (same get/put/del contract: private
// blobs, ETags, ifMatch and allowOverwrite), so the compare-and-swap paths run without a network.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const blobs = new Map<string, { body: string; etag: number }>();
let seq = 0;

vi.mock('@vercel/blob', () => {
  class BlobError extends Error {}
  class BlobPreconditionFailedError extends BlobError {}
  return {
    BlobError,
    BlobPreconditionFailedError,
    async get(path: string) {
      const b = blobs.get(path);
      if (!b) throw new BlobError('The requested blob does not exist');
      return { statusCode: 200, stream: new Response(b.body).body, blob: { etag: `W/"${b.etag}"` } };
    },
    async put(path: string, body: string, o: { ifMatch?: string; allowOverwrite?: boolean }) {
      const cur = blobs.get(path);
      if (o.ifMatch !== undefined && (!cur || `"${cur.etag}"` !== o.ifMatch)) throw new BlobPreconditionFailedError('precondition failed');
      if (o.ifMatch === undefined && cur && !o.allowOverwrite) throw new BlobError('This blob already exists');
      blobs.set(path, { body, etag: ++seq });
      return {};
    },
    async del(path: string) { blobs.delete(path); },
  };
});

const store = await import('../lib/store');
const H = (c: string) => c.repeat(64);

const report = (id: string, hashes: string[], over: Partial<import('../lib/store').StoredReport> = {}) => ({
  id, bank_id: 'SBI', channel: 'sms', rules: ['G01_NO_SECRETS'], severity: 'critical', indicators: hashes.map((h) => ({ t: 'upi', h })),
  hour: '2026-10-25T10', sealed: 'c2VhbGVk', sealed_hash: H('0'), receipt_sig: 'sig', ticket_hash: H('1'),
  received_at: '2026-10-25T10:00:00.000Z', status: 'delivered' as const, updated_at: '2026-10-25T10:00:00.000Z', ...over,
});

beforeEach(() => { blobs.clear(); delete process.env.SATYA_STORE_PREFIX; });

describe('store', () => {
  it('keeps indicator fingerprints on the inbox row, never the sealed box or ticket', async () => {
    await store.saveReport(report('r1', [H('a'), H('a'), H('b')]));
    const [row] = await store.listReports('SBI');
    expect(row.ih).toEqual([H('a'), H('b')]);
    expect(row.indicator_count).toBe(3);
    expect(row).not.toHaveProperty('sealed');
    expect(row).not.toHaveProperty('ticket_hash');
  });

  it('fills fingerprints for inbox rows written before 0.4.0, once', async () => {
    await store.saveReport(report('old', [H('c')]));
    const path = 'index/SBI.json';
    const legacy = JSON.parse(blobs.get(path)!.body).map(({ ih: _ih, ...rest }: any) => rest);
    blobs.set(path, { body: JSON.stringify(legacy), etag: ++seq });
    expect((await store.listReports('SBI'))[0].ih).toEqual([H('c')]);
    expect(JSON.parse(blobs.get(path)!.body)[0].ih).toEqual([H('c')]);
  });

  it('a kill closes exactly the open reports that carry the value, from the index', async () => {
    await store.saveReport(report('hit', [H('d')]));
    await store.saveReport(report('miss', [H('e')]));
    await store.saveReport(report('done', [H('d')], { status: 'dismissed' }));
    const closed = await store.addToBlocklist('SBI', [{ t: 'upi', h: H('d'), label: 'UPI kyc***@ybl' }]);
    expect(closed).toBe(1);
    const byId = Object.fromEntries((await store.listReports('SBI')).map((r) => [r.id, r.status]));
    expect(byId).toEqual({ hit: 'blocked', miss: 'delivered', done: 'dismissed' });
    expect((await store.herdLookup(H('d').slice(0, 5)))[0].confirmed_by).toBe('SBI');
  });

  it('SATYA_STORE_PREFIX keeps a local run out of production paths', async () => {
    process.env.SATYA_STORE_PREFIX = 'dev/';
    await store.saveReport(report('p1', []));
    expect([...blobs.keys()].every((k) => k.startsWith('dev/'))).toBe(true);
  });

  it('deleteReport removes the blob and the inbox row', async () => {
    await store.saveReport(report('gone', []));
    await store.deleteReport('SBI', 'gone');
    expect(await store.getReport('gone')).toBeNull();
    expect(await store.listReports('SBI')).toEqual([]);
  });
});
