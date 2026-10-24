export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fail, isResponse, json, readJson, requireApp } from '@/lib/gateway';
import { b64decode, doctorMessage, openSealed, signHex } from '@/lib/satya/crypto';
import { sha256Hex } from '@/lib/satya/hash';

/** Doctor D12: the phone seals "satya-doctor" to the Doctor box key; we open it and sign its hash. */
export async function POST(req: Request) {
  const denied = requireApp(req);
  if (denied) return denied;
  const body = await readJson(req, 4096);
  if (isResponse(body)) return body;
  const sealed = (body as any)?.sealed;
  if (typeof sealed !== 'string') return fail(400, 'sealed_required');
  const pk = process.env.SATYA_DOCTOR_BOX_PK; const sk = process.env.SATYA_DOCTOR_BOX_SK; const rsk = process.env.SATYA_RECEIPT_SK;
  if (!pk || !sk || !rsk) return fail(500, 'not_configured');
  try {
    const plain = await openSealed(await b64decode(sealed), pk, sk);
    const sha = sha256Hex(plain);
    return json({ ok: true, plaintext_sha256: sha, sig: await signHex(doctorMessage(sha), rsk) });
  } catch {
    return fail(400, 'cannot_open');
  }
}
