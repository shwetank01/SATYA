export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { z } from 'zod';
import { fail, isResponse, json, readJson, requireBank } from '@/lib/gateway';
import { scamCheck } from '@/lib/scamcheck';

const Body = z.object({
  text: z.string().min(1).max(4000),
  channel: z.enum(['sms', 'call', 'whatsapp', 'email', 'screen', 'voice']).default('sms'),
  sender: z.string().max(80).default(''),
});

/**
 * NYAYA Scam Check: the same promise rules the phone runs (from the cards phones receive), then
 * Sarvam's reading of the message. Rules decide "Breaks promise"; the AI can only add
 * "Looks like a scam". Nothing is stored.
 */
export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  const body = await readJson(req, 24_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  return json(await scamCheck(p.data.text, p.data.channel, p.data.sender));
}
