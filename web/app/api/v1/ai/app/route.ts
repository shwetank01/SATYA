export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { appOpinion } from '@/lib/ai/analyze';
import { sarvamConfigured } from '@/lib/ai/sarvam';
import { fail, isResponse, json, readJson, requireApp } from '@/lib/gateway';

const Body = z.object({
  label: z.string().min(1).max(120),
  pkg: z.string().regex(/^[A-Za-z0-9_.]{2,160}$/),
  installer: z.string().max(160).nullish(),
  source: z.string().max(80),
});

/** Know Your App second opinion, asked only when the user taps it. Public app metadata only. */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  if (!sarvamConfigured()) return fail(503, 'ai_not_configured');
  const body = await readJson(req, 2048);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  return json(await appOpinion({ ...p.data, installer: p.data.installer ?? null }));
}
