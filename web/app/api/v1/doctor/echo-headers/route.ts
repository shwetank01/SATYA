export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { json, requireApp } from '@/lib/gateway';

/** Doctor C12: which identifying headers reached the gateway (proves SETU strips them). Values are never echoed. */
export async function GET(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const names = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'user-agent', 'cookie', 'x-satya-relay'];
  const present = Object.fromEntries(names.map((n) => [n, req.headers.has(n)]));
  // Vercel always sets x-forwarded-for to the *connecting* IP; through SETU that is Cloudflare's, not the phone's.
  return json({ present, via_setu: req.headers.get('x-satya-relay') === 'setu' });
}
