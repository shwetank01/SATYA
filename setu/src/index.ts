/**
 * SETU (Section 8.6): a privacy relay between the phone and SATYA's cloud.
 *
 *   /api/*    -> GATEWAY_URL (Vercel)        e.g. /api/v1/registry
 *   /vivek/*  -> VIVEK_URL   (Modal / tunnel) e.g. /vivek/v1/ask -> {VIVEK_URL}/v1/ask
 *
 * The request is rebuilt from scratch with only four headers. The phone's IP address
 * (CF-Connecting-IP, X-Forwarded-For, X-Real-IP), its user agent and any cookies never reach the
 * cloud, so the gateway cannot link a report or a herd lookup to a person. Bodies are streamed
 * through untouched and never logged. In the demo SATYA runs both sides; in production an
 * independent party would run this relay.
 */

export interface Env {
  GATEWAY_URL: string;
  VIVEK_URL: string;
}

/** The only request headers that may cross the relay. */
export const FORWARD = ['content-type', 'x-satya-app', 'x-satya-ticket', 'authorization'] as const;
/** Response headers passed back to the phone. */
const BACK = ['content-type', 'cache-control'];

export function upstreamFor(url: URL, env: Env): string | null {
  const p = url.pathname;
  if (p.startsWith('/api/')) return env.GATEWAY_URL.replace(/\/+$/, '') + p + url.search;
  if (p.startsWith('/vivek/')) return env.VIVEK_URL.replace(/\/+$/, '') + p.slice('/vivek'.length) + url.search;
  return null;
}

export function forwardHeaders(incoming: Headers): Headers {
  const h = new Headers();
  for (const k of FORWARD) {
    const v = incoming.get(k);
    if (v) h.set(k, v);
  }
  h.set('x-satya-relay', 'setu');
  return h;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ ok: true, service: 'setu', forwards: FORWARD, strips: ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'user-agent', 'cookie'] });
    }
    const target = upstreamFor(url, env);
    if (!target) return Response.json({ error: 'not_found' }, { status: 404 });
    if (!['GET', 'POST'].includes(req.method)) return Response.json({ error: 'method_not_allowed' }, { status: 405 });

    const upstream = new Request(target, {
      method: req.method,
      headers: forwardHeaders(req.headers),
      // Buffered (reports <= 2 MB, voice <= 15 MB): portable across the Workers runtime and Node test runs.
      body: req.method === 'POST' ? await req.arrayBuffer() : undefined,
      redirect: 'manual',
    });
    let res: Response;
    try {
      res = await fetch(upstream, { cf: { cacheTtl: 0, cacheEverything: false } } as RequestInit);
    } catch {
      return Response.json({ error: 'upstream_unreachable' }, { status: 502 });
    }
    const out = new Headers();
    for (const k of BACK) {
      const v = res.headers.get(k);
      if (v) out.set(k, v);
    }
    out.set('cache-control', 'no-store');
    return new Response(res.body, { status: res.status, headers: out });
  },
} satisfies ExportedHandler<Env>;
