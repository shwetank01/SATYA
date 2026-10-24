import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { forwardHeaders, upstreamFor } from '../src/index';

const env = { GATEWAY_URL: 'https://gw.example', VIVEK_URL: 'https://vivek.example/' };

describe('SETU routing', () => {
  it('maps /api and /vivek to the right upstream', () => {
    expect(upstreamFor(new URL('https://setu.dev/api/v1/registry'), env)).toBe('https://gw.example/api/v1/registry');
    expect(upstreamFor(new URL('https://setu.dev/vivek/v1/ask?x=1'), env)).toBe('https://vivek.example/v1/ask?x=1');
    expect(upstreamFor(new URL('https://setu.dev/other'), env)).toBeNull();
  });
});

describe('SETU header stripping', () => {
  it('forwards only the four allowed headers', () => {
    const h = forwardHeaders(new Headers({
      'content-type': 'application/json', 'x-satya-app': 'k', 'x-satya-ticket': 't', authorization: 'Bearer b',
      'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4', 'user-agent': 'Samsung SM-S918B', cookie: 'a=b',
    }));
    expect([...h.keys()].sort()).toEqual(['authorization', 'content-type', 'x-satya-app', 'x-satya-relay', 'x-satya-ticket']);
  });
});

describe('SETU fetch', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('relays the body and never passes identifying headers upstream', async () => {
    let seen: Request | null = null;
    vi.stubGlobal('fetch', async (r: Request) => { seen = r; return new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json', 'set-cookie': 'x=y' } }); });
    const res = await worker.fetch(new Request('https://setu.dev/api/v1/reports', {
      method: 'POST', body: '{"v":1}', headers: { 'content-type': 'application/json', 'x-satya-app': 'k', 'x-forwarded-for': '9.9.9.9', 'user-agent': 'phone' },
    }), env);
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(seen!.url).toBe('https://gw.example/api/v1/reports');
    expect(seen!.headers.get('x-forwarded-for')).toBeNull();
    expect(seen!.headers.get('user-agent')).toBeNull();
    expect(await seen!.text()).toBe('{"v":1}');
  });
});
