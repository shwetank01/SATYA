export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { passwordOk, sessionCookie } from '@/lib/console/auth';
import { fail, isResponse, json, readJson } from '@/lib/gateway';
import { ANALYST, cleanAnalyst, ORGS } from '@/lib/orgs';
import { logAction, storeConfigured } from '@/lib/store';

// `bank` is the 0.3.0 field name, still accepted so older scripts keep working.
const Body = z.object({ org: z.string().max(16).optional(), bank: z.string().max(16).optional(), user: z.string().max(60).default(''), password: z.string().max(200) });

export async function POST(req: Request) {
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  const org = p.success ? ORGS[p.data.org ?? p.data.bank ?? ''] : undefined;
  if (!p.success || !org) return fail(400, 'invalid_body');
  const user = cleanAnalyst(p.data.user || 'Fraud desk');
  if (!ANALYST.test(user)) return fail(400, 'invalid_name');
  if (!process.env.NYAYA_SECRET) return fail(503, 'console_not_configured');
  // Same answer and similar time for a wrong password and a wrong org.
  if (!passwordOk(p.data.password, org.id)) { await new Promise((r) => setTimeout(r, 400)); return fail(401, 'wrong_password'); }
  if (storeConfigured()) await logAction(org.id, user, 'signed_in');
  return json({ org: org.id, orgName: org.name, kind: org.kind, user }, 200, { 'set-cookie': sessionCookie(org.id, user) });
}
