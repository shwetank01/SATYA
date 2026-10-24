export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { db, fail, isResponse, json, readJson, requireConsole } from '@/lib/gateway';
import { verifyHex } from '@/lib/satya/crypto';

const Body = z.object({ bank_id: z.string().regex(/^[A-Z0-9_]{2,16}$/), card_json: z.string().min(10).max(200_000), sig: z.string().regex(/^[0-9a-f]{128}$/) });

/**
 * Promise Card Builder publish (I1). The card is signed in the bank's browser with its Sign key;
 * we verify over the exact UTF-8 string (never re-serialised) against the certified sign_pk.
 */
export async function POST(req: Request) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const body = await readJson(req, 220_000);
  if (isResponse(body)) return body;
  const p = Body.safeParse(body);
  if (!p.success) return fail(400, 'invalid_body');
  const { bank_id, card_json, sig } = p.data;
  if (!u.orgs.includes(bank_id)) return fail(403, 'forbidden');
  let card: any;
  try { card = JSON.parse(card_json); } catch { return fail(400, 'card_not_json'); }
  if (card?.bank_id !== bank_id || card?.v !== 1 || !Array.isArray(card?.promises)) return fail(400, 'card_mismatch');
  const { data: org } = await db().from('orgs').select('sign_pk').eq('id', bank_id).maybeSingle();
  if (!org?.sign_pk) return fail(404, 'no_sign_key');
  if (!(await verifyHex(card_json, sig, org.sign_pk))) return fail(400, 'bad_signature');
  const { data: prev } = await db().from('promise_cards').select('version').eq('org_id', bank_id).maybeSingle();
  const version = (prev?.version ?? 0) + 1;
  const { error } = await db().from('promise_cards').upsert({ org_id: bank_id, card_json, sig, signed_by: 'bank', version, published_at: new Date().toISOString() });
  if (error) return fail(500, 'publish_failed');
  return json({ version });
}

/** The signed-in bank's current card + certified sign key (console card builder; no app key in the browser). */
export async function GET(req: Request) {
  const u = await requireConsole(req);
  if (isResponse(u)) return u;
  const bank = new URL(req.url).searchParams.get('bank') ?? u.orgs[0];
  if (!bank || !u.orgs.includes(bank)) return fail(403, 'forbidden');
  const [{ data: card }, { data: org }] = await Promise.all([
    db().from('promise_cards').select('card_json,sig,signed_by,version,published_at').eq('org_id', bank).maybeSingle(),
    db().from('orgs').select('sign_pk,box_pk,cert_sig').eq('id', bank).maybeSingle(),
  ]);
  if (!card) return fail(404, 'no_card');
  return json({ ...card, sign_pk: org?.sign_pk ?? null, box_pk: org?.box_pk ?? null, root_pk: process.env.SATYA_ROOT_PK ?? null });
}
