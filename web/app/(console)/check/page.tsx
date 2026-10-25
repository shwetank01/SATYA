'use client';
import { useState } from 'react';
import { Shell, verdictWord } from '@/components/ui';
import { api } from '@/lib/console/client';

interface Hit { id: string; severity: string; promise: string; promise_hi: string | null; issuer: string; source: string | null }
interface Ai { ask_type: string; claimed_bank: string; risk: string; confidence: number; summary: string; summary_hi: string; reasons: string[]; advice: string; advice_hi: string; source: string }
interface Result { bank: string | null; hits: Hit[]; verdict: string; ai: Ai | null }

const SAMPLES = [
  ['sms', 'VM-SBIUPD', 'Dear SBI customer, your YONO account will be blocked today. Update PAN KYC now: sbi-kyc-update.in/verify'],
  ['whatsapp', '+91 98765 43210', 'Sir HDFC fraud team here. To stop the debit, tell me the OTP you just received. Do not tell anyone.'],
  ['sms', 'AX-HDFCBK', 'Rs 2,500.00 debited from A/c XX1234 on 25-10-26 to VPA shop@okaxis. Not you? Call 18002586161 - HDFC Bank'],
] as const;

/** Feature 2: what a customer forwards to the fraud desk, judged by the promise rules plus Sarvam. */
export default function Check() {
  const [channel, setChannel] = useState('sms');
  const [sender, setSender] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');
  const [transcript, setTranscript] = useState('');

  async function run(t = text, ch = channel, snd = sender) {
    if (!t.trim()) return;
    setBusy('Checking…'); setErr(''); setRes(null);
    try { setRes(await api<Result>('/check', { method: 'POST', body: JSON.stringify({ text: t, channel: ch, sender: snd }) })); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  async function voice(f: File) {
    if (f.size > 4 * 1024 * 1024) { setErr('Voice notes up to 4 MB.'); return; }
    setBusy('Transcribing with Sarvam Saaras…'); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/v1/ai/voice', { method: 'POST', body: f, headers: { 'content-type': f.type || 'audio/mpeg' }, credentials: 'same-origin' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setTranscript(j.transcript || '(no speech found)');
      if (j.transcript) { setText(j.transcript); setChannel('voice'); await run(j.transcript, 'voice', ''); }
    } catch (e) { setErr((e as Error).message); }
    setBusy('');
  }

  return (
    <Shell kind="bank" title="Scam Check" sub="For the contact centre: a customer calls asking “is this really you?”. Paste what they received or upload their voice note. SATYA’s promise rules decide, Sarvam AI explains, and you get the words to say back in English and Hindi. Nothing is stored.">
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <form className="card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ch" className="micro">Channel</label>
              <select id="ch" className="field mt-1.5" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {['sms', 'whatsapp', 'call', 'email', 'screen', 'voice'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="snd" className="micro">Sender (SMS header, number or email)</label>
              <input id="snd" className="field mt-1.5" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="e.g. VM-SBIUPD" />
            </div>
          </div>
          <div>
            <label htmlFor="msg" className="micro">Message or transcript</label>
            <textarea id="msg" className="field mt-1.5 !h-40 py-3 leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Paste the message here" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ink" disabled={!!busy || !text.trim()}>{busy || 'Check message'}</button>
            <label className="btn-ghost cursor-pointer">Upload voice note<input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) voice(f); }} /></label>
          </div>
          <div>
            <div className="micro">Try a sample</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {SAMPLES.map(([ch, snd, t], i) => (
                <button type="button" key={i} className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm font-semibold" onClick={() => { setChannel(ch); setSender(snd); setText(t); run(t, ch, snd); }}>
                  {['KYC link', 'OTP call', 'Debit alert'][i]}
                </button>
              ))}
            </div>
          </div>
          {transcript && <p className="text-sm"><span className="micro">Transcript</span><br />{transcript}</p>}
        </form>

        <div className="space-y-4" aria-live="polite">
          {err && <div className="card p-6 font-semibold">Couldn’t check ({err}).</div>}
          {!res && !err && <div className="card p-6 text-muted">The verdict appears here.</div>}
          {res && (
            <>
              <div className="card p-6">
                <div className="micro">Verdict{res.bank ? ` · claims to be ${res.bank}` : ''}</div>
                <div className="mt-2"><span className="stamp stamp-big stamp-in">{verdictWord(res.verdict)}</span></div>
                {res.verdict === 'no_broken_promise' && <p className="mt-3 text-sm text-muted">No bank promise covers this. That does not prove it is safe.</p>}
                <div className="mt-4 space-y-3">
                  {res.hits.map((h) => (
                    <div key={h.id} className="flex items-start gap-3"><span className="stamp">{h.severity}</span><div><div className="font-semibold">{h.id}</div><div className="text-sm italic text-body2">“{h.promise}”</div>{h.source && <a className="text-xs font-semibold text-blue" href={h.source} target="_blank" rel="noreferrer">Source</a>}</div></div>
                  ))}
                </div>
              </div>
              {res.ai?.source === 'ai' && (
                <div className="card p-6">
                  <div className="flex items-center justify-between"><div className="font-display text-lg font-semibold">SATYA AI reading</div><span className="micro">Sarvam · {res.ai.risk} · {Math.round(res.ai.confidence * 100)}%</span></div>
                  <p className="mt-2 text-[15px] leading-relaxed">{res.ai.summary}</p>
                  <p lang="hi" className="mt-1 text-[15px] leading-relaxed text-body2">{res.ai.summary_hi}</p>
                  {!!res.ai.reasons.length && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{res.ai.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  {res.ai.advice && (
                    <div className="mt-4 rounded-2xl bg-paper p-3 text-sm">
                      <div className="micro">Say this to the customer</div>
                      <p className="mt-1 font-semibold">{res.ai.advice}</p>
                      <p lang="hi" className="mt-1 text-body2">{res.ai.advice_hi}</p>
                      <div className="mt-2 flex gap-3 text-xs font-semibold text-blue">
                        <button className="underline" onClick={() => navigator.clipboard?.writeText(res.ai!.advice)}>Copy English</button>
                        <button className="underline" onClick={() => navigator.clipboard?.writeText(res.ai!.advice_hi)}>Copy Hindi</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {res.ai && res.ai.source !== 'ai' && <div className="card p-6 text-sm">The AI is unavailable right now; the rules verdict above still stands.</div>}
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
