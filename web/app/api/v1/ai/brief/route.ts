export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { caseBrief } from '@/lib/ai/analyze';
import { sarvamConfigured } from '@/lib/ai/sarvam';
import { fail, isResponse, json, readJson, requireConsole } from '@/lib/gateway';

/**
 * NYAYA case brief. The bank's browser opened the sealed report and chooses to send the opened
 * payload (customer details already masked on the phone, no screenshot) for a summary. Not stored.
 */
export async function POST(req: Request) {
  const u = requireConsole(req);
  if (isResponse(u)) return u;
  if (!sarvamConfigured()) return fail(503, 'ai_not_configured');
  const body = await readJson(req, 64_000);
  if (isResponse(body)) return body;
  if (!body || typeof body !== 'object') return fail(400, 'invalid_body');
  const { screenshot_jpeg_b64: _drop, callback_number: _cb, ...rest } = body as Record<string, unknown>;
  return json(await caseBrief({ ...rest, bank: u.org }));
}
