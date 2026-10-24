'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/ui';
import { api, supabase } from '@/lib/console/client';
import { CHANNELS, imageText, inr, loadRules, pdfText } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';
import { FLAG_REASON, FLAG_SEVERITY, payCheck, type PayResult } from '@/lib/satya/paycheck';
import { sha256Hex } from '@/lib/satya/hash';

/** I7 Pay Check: every payment request checked before money moves. Files stay in this browser (voice notes go to VIVEK). */
export default function PayCheck() {
  const s = useSession();
  const router = useRouter();
  const [rules, setRules] = useState<Awaited<ReturnType<typeof loadRules>> | null>(null);
  const [requester, setRequester] = useState('');
  const [channel, setChannel] = useState<string>('email');
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<number | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState<PayResult | null>(null);
  const threshold = 0.7;

  useEffect(() => { loadRules(s.org).then((r) => { setRules(r); setRequester(r.approvers[0]?.name ?? 'Other'); }); }, [s.org]);

  async function onFile(f: File) {
    setRes(null); setVoice(null);
    setFileHash(sha256Hex(new Uint8Array(await f.arrayBuffer())));
    try {
      if (f.type === 'application/pdf') { setBusy('Reading the PDF in this browser…'); setText(await pdfText(f)); }
      else if (f.type.startsWith('image/')) { setBusy('Reading the image (OCR, English + Hindi)…'); setText(await imageText(f, (p) => setBusy(`Reading the image… ${Math.round(p * 100)}%`))); }
      else if (f.type.startsWith('audio/')) {
        setBusy('Scoring the voice note and transcribing it…'); setChannel('voice_note');
        const r = await api('/vivek/voice', { method: 'POST', body: await f.arrayBuffer(), headers: { 'content-type': f.type } });
        setVoice(r.synthetic_score ?? null);
        setText(r.transcript || text);
      }
    } catch (e: any) { alert(e.message); } finally { setBusy(''); }
  }

  async function check() {
    if (!rules) return;
    const r = payCheck(rules, { requester, channel, text, voice_score: voice }, threshold);
    setRes(r);
    const { data, error } = await supabase().from('pay_checks').insert({
      org_id: s.org, request_hash: fileHash ?? sha256Hex(text), requester, channel, amount_inr: r.amount,
      flags: r.flags.map((f) => ({ flag: f, severity: FLAG_SEVERITY[f], reason: FLAG_REASON[f] })), voice_score: voice, decision: r.decision,
    }).select('id').single();
    if (!error && data) router.push(`/pay/check/${data.id}`);
  }

  return (
    <Shell title="Pay Check" sub="Paste or upload a payment request. SATYA checks it against your vendors, approvers, channels and limits before any money moves.">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="card space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="micro">Requested by</label>
              <select className="field mt-1.5" value={requester} onChange={(e) => setRequester(e.target.value)}>
                {rules?.approvers.map((a) => <option key={a.name} value={a.name}>{a.name} · {a.role}</option>)}
                <option value="Other">Someone else</option>
              </select></div>
            <div><label className="micro">Arrived by</label>
              <select className="field mt-1.5" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          <div><label className="micro">The request</label>
            <textarea className="field mt-1.5" rows={7} value={text} onChange={(e) => { setText(e.target.value); setFileHash(null); }} placeholder="This is Mehta. Transfer 4.8 lakh to account 50100123456780 IFSC HDFC0001234 urgently today…" /></div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-ghost cursor-pointer">Upload PDF, image or voice note<input type="file" className="hidden" accept="application/pdf,image/*,audio/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
            {voice != null && <span className="stamp">Voice {Math.round(voice * 100)}%</span>}
            {busy && <span className="text-sm text-muted">{busy}</span>}
          </div>
          <button className="btn-ink w-full" disabled={!text.trim() || !!busy} onClick={check}>Check this payment</button>
        </div>
        <div className="card p-6">
          {!res ? <p className="text-muted">The result appears here: every flag with its reason, and HOLD or CLEAR.</p> : (
            <>
              <div className="flex items-center justify-between"><div><div className="micro">Decision</div><div className="font-display text-3xl font-bold">{res.decision === 'hold' ? 'Hold' : 'Clear'}</div></div><span className="stamp stamp-big stamp-in">{res.decision}</span></div>
              <div className="mt-3 text-sm">Amount found: <b>{inr(res.amount)}</b></div>
              <ul className="mt-4 space-y-2">{res.flags.map((f) => <li key={f} className="flex gap-3"><span className="stamp">{FLAG_SEVERITY[f]}</span><span className="text-sm"><b>{f}</b> {FLAG_REASON[f]}</span></li>)}</ul>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
