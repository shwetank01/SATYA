'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api, getKeys } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';
import { openSealedB64Text } from '@/lib/satya/crypto';
import { maskedLabel, normalize, type IndicatorType } from '@/lib/satya/normalize';
import { bankOfIfsc, bankOfUpi } from '@/lib/satya/psp';

interface Payload {
  created_at: string; source_app: string; channel: string; claimed_bank: string; sender: string; masked_text: string;
  raw_indicators: { t: IndicatorType; value: string }[];
  rule_hits: { id: string; severity: string; promise: string; issuer: string; source: string; ai_assisted: boolean }[];
  scores: { face: number | null; voice: number | null }; herd: { seen_7d: number; reports: number };
  timeline: { t: string; event: string }[]; screenshot_jpeg_b64: string | null; callback_number: string | null;
  kill_chain_stage?: number; verdict?: string;
  ai?: { risk?: string; summary?: string; reasons?: string[] } | null;
}
interface Stored { id: string; bank_id: string; status: string; sealed: string; sealed_hash: string; received_at: string }
interface Brief { headline: string; what_happened: string; modus_operandi: string; recommended_action: 'block' | 'investigate' | 'dismiss'; action_reason: string; source: string }

const KILLABLE = ['upi', 'tel', 'host', 'app', 'acct'];

/** The bank holding a UPI ID or an account (from its IFSC), for the Mule Watch hint. */
const homeOf = (t: string, v: string) => (t === 'upi' ? bankOfUpi(v) : t === 'acct' ? bankOfIfsc(v.toUpperCase().match(/[A-Z]{4}0[A-Z0-9]{6}/)?.[0] ?? '') : null);

/** Case review: the sealed box is opened here, in the bank's browser, with its Box key. */
export default function Case({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const s = useSession();
  const [row, setRow] = useState<Stored | null>(null);
  const [p, setP] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'nokeys' | 'error' | 'ok'>('loading');
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefing, setBriefing] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await api<Stored>(`/reports/${id}/sealed`).catch(() => null);
      if (!r) { setState('error'); return; }
      setRow(r);
      const k = await getKeys(s.org);
      if (!k?.box) { setState('nokeys'); return; }
      try {
        const payload = JSON.parse(await openSealedB64Text(r.sealed, k.box.pk, k.box.sk)) as Payload;
        setP(payload);
        setPick(new Set(payload.raw_indicators.map((x, i) => (KILLABLE.includes(x.t) ? i : -1)).filter((i) => i >= 0)));
        setState('ok');
        if (r.status === 'delivered') api(`/reports/${id}/opened`, { method: 'POST' }).then(() => setRow({ ...r, status: 'opened' })).catch(() => {});
      } catch { setState('error'); }
    })();
  }, [id, s.org]);

  async function askBrief() {
    if (!p) return;
    setBriefing(true);
    const { screenshot_jpeg_b64: _s, callback_number: _c, ...rest } = p;
    setBrief(await api<Brief>('/ai/brief', { method: 'POST', body: JSON.stringify(rest) }).catch(() => null));
    setBriefing(false);
  }

  async function kill() {
    if (!p || !row) return;
    const indicators = p.raw_indicators.filter((_, i) => pick.has(i)).filter((x) => KILLABLE.includes(x.t)).map((x) => {
      const n = normalize(x.t, x.value);
      return { t: x.t, h: n.h, label: maskedLabel(x.t, n.canonical), ...(x.t === 'acct' ? { home: homeOf(x.t, x.value) } : {}) };
    });
    if (!indicators.length) return;
    try {
      const r = await api<{ blocked_reports: number }>('/kill', { method: 'POST', body: JSON.stringify({ indicators }) });
      setMsg(`Blocked for every SATYA phone at its next sync. ${r.blocked_reports} report${r.blocked_reports === 1 ? '' : 's'} closed.`);
      setRow({ ...row, status: 'blocked' });
    } catch (e) { setMsg(`Couldn’t block (${(e as Error).message}).`); }
  }

  const closed = row?.status === 'blocked' || row?.status === 'dismissed';
  return (
    <Shell kind="bank" title="Case review" sub="Opened in this browser with your bank’s private key. SATYA’s gateway only ever held the sealed box." actions={<Link className="btn-ghost" href="/inbox">Back to inbox</Link>}>
      {state === 'loading' && <div className="card p-8 text-muted">Opening the sealed report…</div>}
      {state === 'nokeys' && <div className="card p-8">This browser doesn’t hold {s.orgName}’s Box key yet. <Link className="font-semibold text-blue underline" href="/inbox">Import it on the inbox</Link>, then come back.</div>}
      {state === 'error' && <div className="card p-8">This report can’t be opened here (not found, or sealed to a different key).</div>}
      {p && row && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="card relative p-6">
            {row.status === 'blocked' && <div className="stamp-in absolute right-6 top-6 rounded-xl bg-paper/90 p-1"><span className="stamp stamp-big !border-blue !text-blue">Confirmed fake</span></div>}
            <div className="micro">Sealed report · {row.id.slice(0, 8)} · sha256 {row.sealed_hash.slice(0, 10)}… · received {new Date(row.received_at).toLocaleString('en-IN')}</div>
            <div className="mt-4 micro">Sender</div>
            <div className="text-lg font-semibold">{p.sender || '—'} <span className="text-sm font-normal text-muted">· {p.channel} · {p.source_app}</span></div>
            <div className="mt-5 micro">Message (the customer’s own details were masked on their phone)</div>
            <div className="mt-2 rounded-2xl bg-evidence p-3"><div className="max-w-[90%] whitespace-pre-wrap rounded-[4px_14px_14px_14px] bg-white px-3 py-2 text-[15px] leading-relaxed">{p.masked_text}</div></div>
            <div className="mt-5 micro">Promises broken</div>
            <div className="mt-2 space-y-3">
              {!p.rule_hits.length && <div className="text-sm text-muted">No rule fired on the phone{p.ai?.summary ? `; SATYA AI said: “${p.ai.summary}”` : '.'}</div>}
              {p.rule_hits.map((h) => (
                <div key={h.id} className="flex items-start gap-3"><span className="stamp">{h.severity}</span><div><div className="font-semibold">{h.id}{h.ai_assisted ? ' · AI-assisted' : ''}</div>{h.promise && <div className="text-sm italic text-body2">“{h.promise}”</div>}{h.source && <a className="text-xs font-semibold text-blue" href={h.source} target="_blank" rel="noreferrer">Source</a>}</div></div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-dashed border-ink/10 pt-4 text-sm md:grid-cols-4">
              <div><div className="micro">Seen 7d</div><div className="font-semibold">{p.herd?.seen_7d ?? 0}</div></div>
              <div><div className="micro">Reports</div><div className="font-semibold">{p.herd?.reports ?? 0}</div></div>
              <div><div className="micro">Kill chain</div><div className="font-semibold">{p.kill_chain_stage ? `${p.kill_chain_stage} / 4` : '—'}</div></div>
              <div><div className="micro">Voice score</div><div className="font-semibold">{p.scores?.voice ?? '—'}</div></div>
            </div>
            <div className="mt-5 micro">Timeline</div>
            <ul className="mt-2 space-y-1 text-sm">{p.timeline.map((t, i) => <li key={i}><span className="font-semibold">{new Date(t.t).toLocaleString('en-IN')}</span> · {t.event}</li>)}</ul>
            {p.callback_number && <div className="mt-4 text-sm"><span className="micro">Callback requested</span><div className="font-semibold">{p.callback_number}</div></div>}
            {p.screenshot_jpeg_b64 && <img className="mt-4 max-h-96 rounded-xl border" alt="Masked screenshot from the customer" src={`data:image/jpeg;base64,${p.screenshot_jpeg_b64}`} />}
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-3"><div className="font-display text-lg font-semibold">AI case brief</div><span className="micro">Sarvam</span></div>
              {!brief && <p className="mt-1 text-sm text-body2">Sends the opened report (customer details already masked; no screenshot, no callback number) to Sarvam for a summary. Nothing is stored.</p>}
              {brief && brief.source === 'ai' && (
                <div className="mt-2 space-y-2 text-sm">
                  <div className="font-semibold">{brief.headline}</div>
                  <p className="text-body2">{brief.what_happened}</p>
                  <p><span className="micro">Pattern</span><br />{brief.modus_operandi}</p>
                  <p><span className="micro">Recommended</span><br /><b className="uppercase">{brief.recommended_action}</b> · {brief.action_reason}</p>
                </div>
              )}
              {brief && brief.source !== 'ai' && <p className="mt-2 text-sm font-semibold">The AI is unavailable right now. The rules above still stand.</p>}
              {!brief && <button className="btn-ink mt-3 w-full" disabled={briefing} onClick={askBrief}>{briefing ? 'Reading the report…' : 'Write a case brief'}</button>}
            </div>
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">One-Click Kill</div>
              <p className="mt-1 text-sm text-body2">Confirms these values are not yours. Every SATYA phone treats them as fake from its next sync; the gateway receives only their fingerprints and masked labels.</p>
              <div className="mt-3 space-y-2">
                {p.raw_indicators.map((x, i) => (
                  <label key={i} className={`flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2 ${KILLABLE.includes(x.t) ? '' : 'opacity-50'}`}>
                    <input type="checkbox" disabled={!KILLABLE.includes(x.t) || closed} checked={pick.has(i)} onChange={() => setPick((cur) => { const n = new Set(cur); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                    <span className="text-xs font-bold uppercase text-muted">{x.t}</span><span className="break-all font-semibold">{x.value}</span>
                    {(() => { const home = homeOf(x.t, x.value); return home && home !== s.org ? <span className="ml-auto shrink-0 text-xs text-muted">account at {home}: they get a Mule Watch alert</span> : home === s.org ? <span className="ml-auto shrink-0 text-xs font-semibold">your customer’s account</span> : null; })()}
                  </label>
                ))}
                {!p.raw_indicators.length && <div className="text-sm text-muted">No UPI ID, number or link in this report.</div>}
              </div>
              <button className="btn-ink mt-4 w-full" disabled={closed || !pick.size} onClick={kill}>{row.status === 'blocked' ? 'Blocked' : 'Block for everyone'}</button>
              {msg && <p role="status" className="mt-3 text-sm font-semibold">{msg}</p>}
            </div>
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">Dismiss</div>
              <p className="mt-1 text-sm text-body2">Close without blocking, for example when it was a genuine {s.org} message.</p>
              <button className="btn-ghost mt-3 w-full" disabled={closed} onClick={async () => { await api(`/reports/${id}/dismiss`, { method: 'POST' }); setRow({ ...row, status: 'dismissed' }); }}>{row.status === 'dismissed' ? 'Closed' : 'Dismiss report'}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
