'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api, supabase } from '@/lib/console/client';
import { CHANNELS, inr } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';

/** I8 Verify Before Release + I9 Evidence PDF. */
export default function PayCheckDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const s = useSession();
  const [pc, setPc] = useState<any>(null);
  const [appr, setAppr] = useState<any>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await supabase().from('pay_checks').select('*').eq('id', id).maybeSingle();
    setPc(data);
    if (data) {
      const a = await supabase().from('pay_approvers').select('*').eq('org_id', s.org).eq('name', data.requester).maybeSingle();
      setAppr(a.data);
    }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(result: 'confirmed' | 'denied') {
    const { error } = await supabase().from('pay_checks').update({
      decision: result === 'confirmed' ? 'released' : 'blocked', verify_result: result, decided_by: s.userId, decided_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) setMsg(error.message); else load();
  }

  async function evidence() {
    const r = await api<{ sig: string; receipt_pk: string; message: string }>(`/paycheck/${id}/receipt`, { method: 'POST' });
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const f = await doc.embedFont(StandardFonts.Helvetica); const b = await doc.embedFont(StandardFonts.HelveticaBold);
    let y = 790;
    const line = (t: string, bold = false, size = 11) => { for (const chunk of t.match(/.{1,95}/g) ?? ['']) { page.drawText(chunk, { x: 48, y, size, font: bold ? b : f, color: rgb(0.055, 0.137, 0.282) }); y -= size + 6; } };
    line('SATYA Pay Check: Evidence record', true, 18); y -= 6;
    line(`Company: ${s.orgName}`); line(`Check ID: ${pc.id}`); line(`Created: ${new Date(pc.created_at).toISOString()}`);
    line(`Requested by: ${pc.requester} via ${pc.channel}`); line(`Amount: ${inr(pc.amount_inr)}`); line(`Request SHA-256: ${pc.request_hash}`);
    line(`Voice score: ${pc.voice_score == null ? 'n/a' : Math.round(pc.voice_score * 100) + '% (signal, not proof)'}`); y -= 6;
    line('Flags', true, 13);
    for (const fl of pc.flags ?? []) line(`- ${fl.flag} (${fl.severity}): ${fl.reason}`);
    if (!(pc.flags ?? []).length) line('- none');
    y -= 6; line('Decision log', true, 13);
    line(`Initial decision: ${pc.verify_result ? 'hold' : pc.decision}`);
    if (pc.verify_result) line(`Callback to ${appr?.callback_phone ?? 'approver'}: ${pc.verify_result} -> ${pc.decision} at ${pc.decided_at}`);
    y -= 6; line('Signature (Ed25519, SATYA Receipt key)', true, 13);
    line(`Message: ${r.message}`); line(`Signature: ${r.sig}`); line(`Public key: ${r.receipt_pk}`);
    line('Verify: crypto_sign_verify_detached(signature, message, public key).', false, 9);
    const bytes = await doc.save();
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = `satya-paycheck-${pc.id.slice(0, 8)}.pdf`; a.click(); URL.revokeObjectURL(url);
  }

  if (!pc) return <Shell title="Pay Check"><div className="card p-8 text-muted">Loading…</div></Shell>;
  const label = CHANNELS.find(([v]) => v === pc.channel)?.[1] ?? pc.channel;
  return (
    <Shell title={pc.decision === 'hold' ? 'On hold' : pc.decision === 'clear' ? 'Clear' : pc.decision === 'released' ? 'Released' : 'Blocked'} sub={`${pc.requester} · ${label} · ${inr(pc.amount_inr)}`} actions={<Link className="btn-ghost" href="/pay/history">History</Link>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <div className="micro">Flags</div>
          <ul className="mt-3 space-y-2">{(pc.flags ?? []).map((f: any) => <li key={f.flag} className="flex gap-3"><span className="stamp">{f.severity}</span><span className="text-sm"><b>{f.flag}</b> {f.reason}</span></li>)}</ul>
          {!(pc.flags ?? []).length && <p className="text-sm text-muted">No flags.</p>}
          <div className="mt-4 text-xs text-muted">Request SHA-256 {pc.request_hash}</div>
        </div>
        <div className="card p-6">
          {pc.decision === 'hold' ? (
            <>
              <div className="font-display text-xl font-semibold">Verify Before Release</div>
              <p className="mt-1 text-sm text-body2">Call {pc.requester} on the number saved in your approver list, not any number in the request.</p>
              <div className="mt-4 rounded-2xl bg-paper p-4"><div className="micro">Saved callback number</div><div className="font-display text-2xl font-semibold">{appr?.callback_phone ?? 'Not an approver: call their manager'}</div></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button className="btn-ink" onClick={() => decide('confirmed')}>Called: confirmed</button>
                <button className="btn-ghost" onClick={() => decide('denied')}>Called: denied</button>
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-xl font-semibold">Decision recorded</div>
              <p className="mt-1 text-sm text-body2">{pc.verify_result ? `Callback ${pc.verify_result} at ${new Date(pc.decided_at).toLocaleString('en-IN')}.` : 'Cleared without a callback.'}</p>
              <button className="btn-ink mt-4 w-full" onClick={evidence}>Download Evidence PDF</button>
            </>
          )}
          {msg && <p className="mt-3 text-sm font-semibold">{msg}</p>}
        </div>
      </div>
    </Shell>
  );
}
