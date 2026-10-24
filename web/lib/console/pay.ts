'use client';
import { supabase } from './client';
import type { PayRules } from '../satya/paycheck';

/** The company's rules from its RLS-protected pay_* tables (vendors are stored as hashes only). */
export async function loadRules(org: string): Promise<PayRules & { approverRows: any[]; vendorRows: any[] }> {
  const [r, v, a] = await Promise.all([
    supabase().from('pay_rules').select('*').eq('org_id', org).maybeSingle(),
    supabase().from('pay_vendors').select('*').eq('org_id', org).order('vendor_name'),
    supabase().from('pay_approvers').select('*').eq('org_id', org).order('name'),
  ]);
  return {
    threshold_inr: Number(r.data?.threshold_inr ?? 100000),
    allowed_channels: r.data?.allowed_channels ?? ['email', 'in_person'],
    vendors: (v.data ?? []).map((x: any) => ({ vendor_name: x.vendor_name, acct_hash: x.acct_hash })),
    approvers: (a.data ?? []).map((x: any) => ({ name: x.name, role: x.role, callback_phone: x.callback_phone, max_amount_inr: Number(x.max_amount_inr) })),
    approverRows: a.data ?? [], vendorRows: v.data ?? [],
  };
}

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

export const CHANNELS = [['email', 'Email'], ['in_person', 'In person'], ['whatsapp', 'WhatsApp'], ['call', 'Phone call'], ['voice_note', 'Voice note']] as const;
export const inr = (n: number | null | undefined) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN'));
