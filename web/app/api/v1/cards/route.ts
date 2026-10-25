export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { BUNDLE } from '@/lib/bundle';
import { fail, isResponse, json, readJson, requireBank } from '@/lib/gateway';
import { checkCard, effectiveBanks, publishCard, publishedCards, resetCard, rootCardOf } from '@/lib/registry';
import { logAction, storeConfigured } from '@/lib/store';

/**
 * I1 Promise Card Builder. GET: this bank's live card and certificate, plus every other card so the
 * browser can preview a change with the same rules a phone runs. POST: publish a card the bank
 * signed in its own browser. DELETE: go back to the card SATYA signed with its root key.
 */
export async function GET(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  const banks = storeConfigured() ? await effectiveBanks() : BUNDLE.banks;
  const pub = storeConfigured() ? (await publishedCards())[u.org] : undefined;
  const mine = banks.find((b) => b.bank_id === u.org)!;
  return json({
    bank_id: u.org,
    card: mine.card,
    cert: mine.cert,
    root_pk: process.env.SATYA_ROOT_PK ?? process.env.NEXT_PUBLIC_SATYA_ROOT_PK ?? null,
    published: pub ? { at: pub.published_at, by: pub.published_by, version: pub.version } : null,
    root_card_json: rootCardOf(u.org)!.card_json,
    global_card_json: BUNDLE.global.card_json,
    bank_cards: banks.map((b) => b.card.card_json),
  });
}

const Body = z.object({ card_json: z.string().min(2).max(16_000), sig: z.string().regex(/^[0-9a-f]{128}$/) });

const WHY: Record<string, string> = {
  not_json: 'The card is not valid JSON.',
  wrong_bank: 'The card is for a different bank.',
  bad_signature: 'The signature does not match your bank’s Sign key in its SATYA certificate.',
  locked_field_changed: 'Only the official-channel lists can be changed here.',
  bad_entry: 'One of the entries is not a valid domain, header or number.',
  not_newer: 'The card must be issued after the one it replaces.',
  unknown_bank: 'This bank has no SATYA certificate.',
};

export async function POST(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  const body = await readJson(req, 20_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const current = (await effectiveBanks()).find((b) => b.bank_id === u.org)!.card.card_json;
  const bad = await checkCard(u.org, p.data.card_json, p.data.sig, current);
  if (bad) return json({ error: bad.problem, field: bad.field ?? null, message: WHY[bad.problem] }, 422);
  const saved = await publishCard(u.org, p.data.card_json, p.data.sig, u.user);
  await logAction(u.org, u.user, 'card_published', `version ${saved.version}`, changes(current, p.data.card_json));
  return json({ version: saved.version, published_at: saved.published_at });
}

export async function DELETE(req: Request) {
  const u = requireBank(req);
  if (isResponse(u)) return u;
  if (!storeConfigured()) return fail(503, 'store_not_configured');
  await resetCard(u.org);
  await logAction(u.org, u.user, 'card_reset', `version ${rootCardOf(u.org)!.version}`);
  return json(null, 204);
}

/** "+yonobusiness.sbi in extra_allowed_link_hosts; -SBIPSG in sms_headers" for the audit trail. */
function changes(before: string, after: string): string {
  const a = JSON.parse(before); const b = JSON.parse(after);
  const out: string[] = [];
  for (const k of Object.keys(b)) {
    if (!Array.isArray(b[k]) || !Array.isArray(a[k]) || k === 'promises' || k === 'official_apps') continue;
    for (const x of b[k]) if (!a[k].includes(x)) out.push(`+${x} in ${k}`);
    for (const x of a[k]) if (!b[k].includes(x)) out.push(`-${x} in ${k}`);
  }
  return out.join('; ') || 'no list changes';
}
