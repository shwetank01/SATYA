'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api } from '@/lib/console/client';
import { inr } from '@/lib/console/format';
import { channelName, DECISION, evidencePdf, type PayRecord } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';
import { verifyHex } from '@/lib/satya/crypto';

type Detail = PayRecord & { approver: { name: string; role: string; callback_phone: string } | null; receipt_pk: string | null };

/** I8 Verify Before Release and I9 Evidence PDF for one checked payment. */
export default function PayCheckDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const s = useSession();
  const [d, setD] = useState<Detail | null>(null);
  const [sigOk, setSigOk] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api<Detail>(`/pay/checks/${id}`);
    setD(r);
    setSigOk(r.receipt_pk ? await verifyHex(r.receipt.message, r.receipt.sig, r.receipt_pk) : null);
  }
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(result: 'confirmed' | 'denied') {
    setBusy(true);
    try { await api(`/pay/checks/${id}`, { method: 'POST', body: JSON.stringify({ result }) }); await load(); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  if (!d) return <Shell kind="company" title="Pay Check"><div className="card p-8 text-muted">{msg || 'Loading…'}</div></Shell>;
  return (
    <Shell kind="company" title={DECISION[d.decision]} sub={`${d.summary} · requested by ${d.requester} via ${channelName(d.channel)} · checked by ${d.created_by}, ${new Date(d.created_at).toLocaleString('en-IN')}`} actions={<Link className="btn-ghost" href="/pay/history">All decisions</Link>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center justify-between"><div className="micro">Why</div><span className="stamp">{d.decision}</span></div>
          <ul className="mt-3 space-y-2.5">
            {d.flags.map((f) => <li key={f.flag} className="flex gap-3"><span className="stamp shrink-0">{f.severity}</span><span className="text-sm"><b>{f.flag.replace(/_/g, ' ').toLowerCase()}</b>: {f.reason}</span></li>)}
            {!d.flags.length && <li className="text-sm text-muted">No flags: known vendor, known approver, allowed channel, within limits.</li>}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-dashed border-ink/10 pt-4 text-sm">
            <div><div className="micro">Amount</div><div className="font-semibold">{inr(d.amount_inr)}</div></div>
            <div><div className="micro">Voice score</div><div className="font-semibold">{d.voice_score == null ? 'Not available' : `${Math.round(d.voice_score * 100)}% synthetic`}</div></div>
          </div>
          <div className="mt-4 break-all text-xs text-muted">Request SHA-256 {d.request_hash}</div>
          <div className="mt-1 text-xs text-muted">Signature {sigOk === null ? 'not checked' : sigOk ? 'valid (SATYA Receipt key)' : 'INVALID'} · {d.receipt.message.split('|')[0]}</div>
        </div>

        <div className="card p-6">
          {d.decision === 'hold' ? (
            <>
              <div className="font-display text-xl font-semibold">Verify before release</div>
              <p className="mt-1 text-sm text-body2">Call {d.requester} on the number saved in your Pay Rules, never on a number in the request. A cloned voice cannot answer a call you place.</p>
              <div className="mt-4 rounded-2xl bg-paper p-4">
                <div className="micro">Saved callback number</div>
                <div className="font-display text-2xl font-semibold">{d.approver?.callback_phone ?? 'Not an approver'}</div>
                {!d.approver && <div className="mt-1 text-sm text-muted">{d.requester} is not on your approver list: call their manager or the CFO.</div>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button className="btn-ink" disabled={busy} onClick={() => decide('confirmed')}>Called: they confirmed</button>
                <button className="btn-ghost" disabled={busy} onClick={() => decide('denied')}>Called: they did not ask</button>
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-xl font-semibold">Decision recorded</div>
              <p className="mt-1 text-sm text-body2">
                {d.verify ? `${d.verify.by} called ${d.requester}${d.verify.callback_phone ? ` on ${d.verify.callback_phone}` : ''} at ${new Date(d.verify.at).toLocaleString('en-IN')}: ${d.verify.result === 'confirmed' ? 'confirmed, payment released' : 'they never asked, payment blocked'}.` : 'Cleared by Pay Check without a callback.'}
              </p>
              {d.decision === 'blocked' && <p className="mt-3 rounded-2xl bg-paper p-3 text-sm">If money has already moved, call <b>1930</b> or report at cybercrime.gov.in now, and send this Evidence PDF to your bank.</p>}
            </>
          )}
          <button className="btn-ghost mt-5 w-full" onClick={() => evidencePdf(d, s.orgName, d.receipt_pk)}>Download Evidence PDF</button>
          {msg && <p className="mt-3 text-sm font-semibold">{msg}</p>}
        </div>
      </div>
    </Shell>
  );
}
