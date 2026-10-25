'use client';
// Browser side of Pay Check. Payment requests (text, PDFs, images) are read here and never uploaded;
// only a voice note goes to the gateway, for speech-to-text in memory.
import { api } from './client';
import { herdCounts } from './herd';
import { accounts, upiIds, type NetworkFlag } from '../satya/paycheck';
import { acct, upi } from '../satya/normalize';

export const CHANNELS = [['email', 'Email'], ['in_person', 'In person'], ['whatsapp', 'WhatsApp'], ['call', 'Phone call'], ['voice_note', 'Voice note']] as const;
export const channelName = (c: string) => CHANNELS.find(([v]) => v === c)?.[1] ?? c;

/** Text from a PDF, page by page, in the browser (pdf.js). */
export async function pdfText(file: File): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    out.push(c.items.map((x: any) => x.str).join(' '));
  }
  return out.join('\n');
}

/** OCR for a photo or screenshot of a payment request (English + Hindi), in the browser. */
export async function imageText(file: File, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker(['eng', 'hin'], 1, { logger: (m: any) => m.status === 'recognizing text' && onProgress?.(m.progress) });
  try {
    const { data } = await w.recognize(file);
    return data.text;
  } finally {
    await w.terminate();
  }
}

export interface NetworkHit { value: string; flag: NetworkFlag; by: string | null; reports: number }

/**
 * Checks every account and UPI ID in the request against the SATYA network: the blocklist is matched
 * locally, herd counts are fetched by 5-hex prefix, so the destination is never revealed.
 */
export async function networkCheck(text: string): Promise<NetworkHit[]> {
  const values = [
    ...accounts(text).filter((a) => a.ifsc).map((a) => ({ value: `a/c ${a.account} · ${a.ifsc}`, h: acct(a.account, a.ifsc).h })),
    ...upiIds(text).map((u) => ({ value: u, h: upi(u).h })),
  ];
  if (!values.length) return [];
  const [block, herd] = await Promise.all([
    api<{ items: { h: string; by: string }[] }>('/kill').then((r) => new Map(r.items.map((b) => [b.h, b.by]))),
    herdCounts(values.map((v) => v.h)),
  ]);
  return values.flatMap((v): NetworkHit[] => {
    const by = block.get(v.h) ?? herd.get(v.h)?.confirmed_by ?? null;
    const reports = herd.get(v.h)?.reports ?? 0;
    if (by) return [{ value: v.value, flag: 'NETWORK_BLOCKED', by, reports }];
    if (reports) return [{ value: v.value, flag: 'NETWORK_REPORTED', by: null, reports }];
    return [];
  });
}

export interface PayRecord {
  id: string; created_at: string; created_by: string; requester: string; channel: string; amount_inr: number | null;
  request_hash: string; summary: string; flags: { flag: string; severity: string; reason: string }[]; voice_score: number | null;
  initial: 'hold' | 'clear'; decision: 'hold' | 'clear' | 'released' | 'blocked';
  verify?: { result: 'confirmed' | 'denied'; by: string; at: string; callback_phone: string | null };
  receipt: { message: string; sig: string; decided_at: string }; demo?: boolean;
}

export const DECISION: Record<PayRecord['decision'], string> = { hold: 'On hold', clear: 'Clear', released: 'Released after callback', blocked: 'Blocked after callback' };

/** Standard PDF fonts are WinAnsi only: rupee sign and other scripts are spelt out. */
const pdfSafe = (s: string) => s.replace(/₹/g, 'Rs ').replace(/•/g, '*').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '?');

/** I9 Evidence PDF, built in this browser: the check, every flag with its reason, the decision log and the signature. */
export async function evidencePdf(rec: PayRecord, orgName: string, receiptPkHex: string | null) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`SATYA Pay Check ${rec.id}`); doc.setProducer('NYAYA (SATYA)');
  const page = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica); const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.055, 0.137, 0.282); const blue = rgb(0.122, 0.373, 0.769);
  let y = 790;
  const line = (t: string, bold = false, size = 10.5, color = ink) => {
    for (const chunk of pdfSafe(t).match(/.{1,96}(\s|$)|\S{96}/g) ?? ['']) { page.drawText(chunk.trimEnd(), { x: 48, y, size, font: bold ? b : f, color }); y -= size + 5; }
  };
  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: blue });
  page.drawText('SATYA PAY CHECK - EVIDENCE RECORD', { x: 48, y: 822, size: 11, font: b, color: rgb(0.969, 0.784, 0) });
  line(`${DECISION[rec.decision]}`, true, 20); y -= 4;
  line(`Company: ${orgName}`); line(`Check ID: ${rec.id}`); line(`Checked: ${new Date(rec.created_at).toUTCString()} by ${rec.created_by}`);
  line(`Requested by: ${rec.requester}, via ${channelName(rec.channel)}`); line(`Amount: ${rec.amount_inr == null ? 'not found' : 'Rs ' + rec.amount_inr.toLocaleString('en-IN')}`);
  line(`Request: ${rec.summary}`); line(`Request SHA-256: ${rec.request_hash}`);
  line(`Voice deepfake score: ${rec.voice_score == null ? 'not available (the decision does not depend on it)' : Math.round(rec.voice_score * 100) + '% synthetic (a signal, not proof)'}`);
  y -= 8; line('Flags', true, 13);
  for (const fl of rec.flags) line(`- ${fl.flag} (${fl.severity}): ${fl.reason}`);
  if (!rec.flags.length) line('- none');
  y -= 8; line('Decision log', true, 13);
  line(`1. ${new Date(rec.created_at).toUTCString()}: Pay Check decided ${rec.initial.toUpperCase()}.`);
  if (rec.verify) line(`2. ${new Date(rec.verify.at).toUTCString()}: ${rec.verify.by} called ${rec.requester}${rec.verify.callback_phone ? ` on the saved number ${rec.verify.callback_phone}` : ''}; the approver ${rec.verify.result === 'confirmed' ? 'confirmed the request. Payment RELEASED.' : 'denied making the request. Payment BLOCKED.'}`);
  y -= 8; line('Signature (Ed25519, SATYA Receipt key)', true, 13);
  line(`Message: ${rec.receipt.message}`, false, 9); line(`Signature: ${rec.receipt.sig}`, false, 9); line(`Public key: ${receiptPkHex ?? 'see SATYA_RECEIPT_PK'}`, false, 9);
  y -= 4; line('To verify: crypto_sign_verify_detached(signature, message, public key) with libsodium. Any change to the decision or the request hash breaks it.', false, 9);
  y -= 4; line('The payment request itself never left the company\'s browser; only its SHA-256 is recorded here.', false, 9);
  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a'); a.href = url; a.download = `satya-paycheck-${rec.id.slice(0, 8)}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
