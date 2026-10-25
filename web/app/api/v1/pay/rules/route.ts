export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { fail, HEX64, isResponse, json, readJson, requireCompany } from '@/lib/gateway';
import { getPayRules, logAction, savePayRules, storeConfigured } from '@/lib/store';

/** I6 Pay Rules: vendors (account stored only as a hash + last 4 digits), approvers, limits, channels. */
export async function GET(req: Request) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  return json(await getPayRules(u.org));
}

const id = z.string().regex(/^[0-9a-z-]{6,40}$/);
const Body = z.object({
  threshold_inr: z.number().int().min(0).max(1e11),
  allowed_channels: z.array(z.enum(['email', 'in_person', 'whatsapp', 'call', 'voice_note'])).max(5),
  vendors: z.array(z.object({ id, vendor_name: z.string().min(1).max(80), acct_hash: z.string().regex(HEX64), acct_hint: z.string().regex(/^\d{4}$/) })).max(200),
  approvers: z.array(z.object({ id, name: z.string().min(1).max(60), role: z.string().max(60), callback_phone: z.string().regex(/^[+\d][\d ()-]{6,20}$/), max_amount_inr: z.number().int().min(0).max(1e11) })).max(50),
});

export async function PUT(req: Request) {
  const u = requireCompany(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 64_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const before = await getPayRules(u.org);
  const rules = { ...p.data, updated_at: new Date().toISOString(), updated_by: u.user };
  await savePayRules(u.org, rules);
  const what = [
    rules.threshold_inr !== before.threshold_inr && `callback above Rs ${rules.threshold_inr.toLocaleString('en-IN')}`,
    rules.vendors.length !== before.vendors.length && `${rules.vendors.length} vendors`,
    rules.approvers.length !== before.approvers.length && `${rules.approvers.length} approvers`,
    rules.allowed_channels.join(',') !== before.allowed_channels.join(',') && `channels ${rules.allowed_channels.join(', ') || 'none'}`,
  ].filter(Boolean).join('; ');
  await logAction(u.org, u.user, 'pay_rules_saved', undefined, what || 'no change');
  return json(rules);
}
