// Signed Pay Check receipts (Section 7.4 `satya-paycheck-v1`): the SATYA Receipt key signs the check
// id, the request's SHA-256, the decision and when it was made. Anyone can verify an Evidence PDF
// offline with SATYA_RECEIPT_PK; nobody, including the company, can change a decision afterwards.
import { payReceiptMessage, signHex } from './satya/crypto';
import type { PayReceipt } from './store';

export async function signPayReceipt(checkId: string, requestHash: string, decision: string, decidedAt = new Date().toISOString()): Promise<PayReceipt | null> {
  const sk = process.env.SATYA_RECEIPT_SK;
  if (!sk) return null;
  const message = payReceiptMessage(checkId, requestHash, decision, decidedAt);
  return { message, sig: await signHex(message, sk), decided_at: decidedAt };
}

export const receiptPk = () => process.env.SATYA_RECEIPT_PK ?? null;
