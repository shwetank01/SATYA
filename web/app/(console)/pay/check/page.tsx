'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api } from '@/lib/console/client';
import { inr } from '@/lib/console/format';
import { CHANNELS, imageText, networkCheck, pdfText, type NetworkHit, type PayRecord } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';
import { sha256Hex } from '@/lib/satya/hash';
import { accounts, amounts, payCheck, type AnyPayFlag, type PayRules } from '@/lib/satya/paycheck';
import { acct } from '@/lib/satya/normalize';

interface Rules extends PayRules { vendors: { id: string; vendor_name: string; acct_hash: string; acct_hint: string }[]; approvers: { id: string; name: string; role: string; callback_phone: string; max_amount_inr: number }[] }

/** Appendix E P01: the fake-CFO voice note, transcribed. */
const P01 = 'This is Mehta. Transfer 4.8 lakh to account 50100123456780 IFSC HDFC0001234 urgently today. Keep it confidential, don\'t tell anyone.';
/** Voice threshold from spec/paycheck_cases.json (a signal, never the decision on its own). */
const VOICE_THRESHOLD = 0.7;
const OTHER = '__other__';

/** I7 Pay Check: every payment request checked against the company's own rules before money moves. */
export default function PayCheck() {
  const s = useSession();
  const [rules, setRules] = useState<Rules | null>(null);
  const [requester, setRequester] = useState(OTHER);
  const [channel, setChannel] = useState<string>('email');
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<number | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ rec: PayRecord; network: NetworkHit[] } | null>(null);

  useEffect(() => {
    api<Rules>('/pay/rules').then((r) => { setRules(r); setRequester(r.approvers[0]?.name ?? OTHER); }).catch((e) => setErr(e.message));
  }, []);

  async function onFile(f: File) {
    setResult(null); setVoice(null); setVoiceNote(''); setErr('');
    setFileHash(sha256Hex(new Uint8Array(await f.arrayBuffer())));
    try {
      if (f.type === 'application/pdf') { setBusy('Reading the PDF in this browser…'); setText(await pdfText(f)); }
      else if (f.type.startsWith('image/')) { setBusy('Reading the image in this browser (OCR, English + Hindi)…'); setText(await imageText(f, (p) => setBusy(`Reading the image… ${Math.round(p * 100)}%`))); }
      else if (f.type.startsWith('audio/')) {
        if (f.size > 4 * 1024 * 1024) throw new Error('Voice notes up to 4 MB.');
        setBusy('Transcribing the voice note (Sarvam Saaras, in memory)…'); setChannel('voice_note');
        const r = await fetch('/api/v1/ai/voice', { method: 'POST', body: f, headers: { 'content-type': f.type || 'audio/mpeg' }, credentials: 'same-origin' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setText(j.transcript || '');
        setVoice(typeof j.synthetic_score === 'number' ? j.synthetic_score : null);
        setVoiceNote(typeof j.synthetic_score === 'number' ? '' : 'No deepfake score on this deployment. SATYA holds a payment on what the request asks for, not on how the voice sounds.');
      } else throw new Error('Upload a PDF, an image or a voice note.');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  function describe(t: string, r: Rules): string {
    const amt = amounts(t);
    const acc = accounts(t)[0];
    const vendor = acc && r.vendors.find((v) => v.acct_hash === acct(acc.account, acc.ifsc).h);
    const to = vendor ? vendor.vendor_name : acc ? `a/c ••••${acc.account.slice(-4)}${acc.ifsc ? ` (${acc.ifsc})` : ''}` : 'no account found';
    return `${amt == null ? 'Amount not found' : inr(amt)} to ${to}`.slice(0, 140);
  }

  async function check() {
    if (!rules) return;
    setBusy('Checking against your rules and the SATYA network…'); setErr(''); setResult(null);
    try {
      const local = payCheck(rules, { requester: requester === OTHER ? 'Someone else' : requester, channel, text, voice_score: voice }, VOICE_THRESHOLD);
      const network = await networkCheck(text).catch(() => []);
      const flags = [...new Set<AnyPayFlag>([...local.flags, ...network.map((n) => n.flag)])].sort();
      const rec = await api<PayRecord>('/pay/checks', {
        method: 'POST',
        body: JSON.stringify({ requester: requester === OTHER ? 'Someone else' : requester, channel, amount_inr: local.amount, request_hash: fileHash ?? sha256Hex(text), summary: describe(text, rules), flags, voice_score: voice }),
      });
      setResult({ rec, network });
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  const noRules = rules && !rules.vendors.length && !rules.approvers.length;
  return (
    <Shell kind="company" title="Pay Check" sub={`Paste, upload or forward a payment request. SATYA checks it against ${s.orgName}’s vendors, approvers, channels and limits, and against accounts banks have confirmed as fake, before any money moves.`}>
      {noRules && <div className="card mb-5 p-5 text-sm">No vendors or approvers yet. <Link className="font-semibold text-blue underline" href="/pay/rules">Set up Pay Rules</Link> so SATYA knows which accounts and people are genuine.</div>}
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="card space-y-4 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label htmlFor="req" className="micro">Requested by</label>
              <select id="req" className="field mt-1.5" value={requester} onChange={(e) => setRequester(e.target.value)}>
                {rules?.approvers.map((a) => <option key={a.id} value={a.name}>{a.name} · {a.role}</option>)}
                <option value={OTHER}>Someone else</option>
              </select></div>
            <div><label htmlFor="ch" className="micro">Arrived by</label>
              <select id="ch" className="field mt-1.5" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          <div><label htmlFor="req-text" className="micro">The request</label>
            <textarea id="req-text" className="field mt-1.5 !h-36 leading-relaxed" value={text} onChange={(e) => { setText(e.target.value); setFileHash(null); setResult(null); }} placeholder="e.g. Please release Rs 45,000 to Sharma Traders a/c 50100987654321 IFSC HDFC0001234 for invoice 7781." /></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-ghost cursor-pointer">Upload PDF, image or voice note<input type="file" className="hidden" accept="application/pdf,image/*,audio/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
            <button type="button" className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm font-semibold" onClick={() => { setText(P01); setChannel('voice_note'); setFileHash(null); setVoice(null); setResult(null); setRequester(rules?.approvers.find((a) => a.name.includes('Mehta'))?.name ?? OTHER); setVoiceNote('Sample: the transcript of a cloned-voice note from the "CFO".'); }}>Sample: “CFO” voice note</button>
          </div>
          {voice != null && <p className="text-sm"><span className="stamp">Voice {Math.round(voice * 100)}% synthetic</span> <span className="text-muted">a signal, not proof</span></p>}
          {voiceNote && <p className="text-sm text-body2">{voiceNote}</p>}
          {busy && <p className="text-sm text-muted">{busy}</p>}
          {err && <p role="alert" className="text-sm font-semibold">{err}</p>}
          <button className="btn-ink w-full" disabled={!text.trim() || !!busy || !rules} onClick={check}>Check this payment</button>
          <p className="text-xs text-muted">The request stays in this browser. Only its SHA-256, the flags and the decision are recorded, signed by SATYA.</p>
        </div>

        <div className="card p-6" aria-live="polite">
          {!result ? <p className="text-muted">The decision appears here: HOLD or CLEAR, with every reason.</p> : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div><div className="micro">Decision</div><div className="font-display text-3xl font-bold">{result.rec.decision === 'hold' ? 'Hold this payment' : 'Clear to pay'}</div><div className="mt-1 text-sm text-muted">{result.rec.summary}</div></div>
                <span className="stamp stamp-big stamp-in">{result.rec.decision}</span>
              </div>
              <ul className="mt-5 space-y-2.5">
                {result.rec.flags.map((f) => <li key={f.flag} className="flex gap-3"><span className="stamp shrink-0">{f.severity}</span><span className="text-sm"><b>{f.flag.replace(/_/g, ' ').toLowerCase()}</b>: {f.reason}</span></li>)}
                {!result.rec.flags.length && <li className="text-sm text-muted">Known vendor, known approver, allowed channel, within limits.</li>}
              </ul>
              {!!result.network.length && (
                <div className="mt-4 rounded-2xl bg-paper p-3 text-sm">
                  <div className="micro">From the SATYA network</div>
                  {result.network.map((n) => <div key={n.value} className="mt-1"><b>{n.value}</b>: {n.by ? `confirmed fake by ${n.by}` : ''}{n.by && n.reports ? ', ' : ''}{n.reports ? `reported ${n.reports}× by SATYA users` : ''}</div>)}
                </div>
              )}
              <Link className="btn-ink mt-5 w-full" href={`/pay/check/${result.rec.id}`}>{result.rec.decision === 'hold' ? 'Verify before release' : 'Open the record and Evidence PDF'}</Link>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
