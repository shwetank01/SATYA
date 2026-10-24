export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { BANK_NAMES } from '@/lib/bundle';
import { passwordOk, sessionCookie } from '@/lib/console/auth';
import { fail, isResponse, json, readJson } from '@/lib/gateway';

const Body = z.object({ bank: z.string().max(16), password: z.string().max(200) });

export async function POST(req: Request) {
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success || !(p.data.bank in BANK_NAMES)) return fail(400, 'invalid_body');
  if (!process.env.NYAYA_SECRET) return fail(503, 'console_not_configured');
  // Same answer and similar time for a wrong password and a wrong bank.
  if (!passwordOk(p.data.password)) { await new Promise((r) => setTimeout(r, 400)); return fail(401, 'wrong_password'); }
  return json({ org: p.data.bank, orgName: BANK_NAMES[p.data.bank] }, 200, { 'set-cookie': sessionCookie(p.data.bank) });
}
