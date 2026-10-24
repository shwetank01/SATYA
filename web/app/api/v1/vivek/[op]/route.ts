export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { fail, isResponse, requireConsole } from '@/lib/gateway';

/**
 * Console proxies to VIVEK (I4 Deepfake Re-check, I7 voice notes): /vivek/voice (raw audio <= 4 MB,
 * Vercel's body limit is 4.5 MB) and /vivek/face ({frames}). The console never sees the AI key.
 */
export async function POST(req: Request, ctx: { params: Promise<{ op: string }> }) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const { op } = await ctx.params;
  if (op !== 'voice' && op !== 'face') return fail(404, 'not_found');
  const base = process.env.VIVEK_URL;
  if (!base) return fail(503, 'vivek_not_configured');
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 4 * 1024 * 1024) return fail(413, 'too_large');
  const body = await req.arrayBuffer();
  if (body.byteLength > 4 * 1024 * 1024) return fail(413, 'too_large');
  try {
    const r = await fetch(base.replace(/\/+$/, '') + '/v1/' + op, {
      method: 'POST',
      headers: { 'x-satya-app': process.env.SATYA_APP_KEY ?? '', 'content-type': req.headers.get('content-type') ?? (op === 'face' ? 'application/json' : 'audio/*') },
      body,
      signal: AbortSignal.timeout(55_000),
    });
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return fail(502, 'vivek_unreachable');
  }
}
