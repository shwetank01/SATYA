'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api, getKeys, supabase } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';
import { openSealedB64Text } from '@/lib/satya/crypto';
import { maskedLabel, normalize, type IndicatorType } from '@/lib/satya/normalize';

interface Payload {
  created_at: string; source_app: string; channel: string; claimed_bank: string; sender: string; masked_text: string;
  raw_indicators: { t: IndicatorType; value: string }[];
  rule_hits: { id: string; severity: string; promise: string; issuer: string; source: string; ai_assisted: boolean }[];
  scores: { face: number | null; voice: number | null }; herd: { seen_7d: number; reports: number };
  timeline: { t: string; event: string }[]; screenshot_jpeg_b64: string | null; callback_number: string | null; kill_chain_stage?: number;
}

/** I3 Case Review: the sealed box is opened here, in the bank's browser, with its Box key. */
export default function Case({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const s = useSession();
  const [row, setRow] = useState<any>(null);
  const [p, setP] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'nokeys' | 'error' | 'ok'>('loading');
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const r = await supabase().from('reports').select('*').eq('id', id).maybeSingle();
      const b = await supabase().from('report_blobs').select('sealed').eq('report_id', id).maybeSingle();
      setRow(r.data);
      if (!r.data || !b.data) { setState('error'); return; }
      const k = await getKeys(s.org);
      if (!k?.box) { setState('nokeys'); return; }
      try {
        const text = await openSealedB64Text(b.data.sealed, k.box.pk, k.box.sk);
        const payload = JSON.parse(text) as Payload;
        setP(payload);
        setPick(new Set(payload.raw_indicators.map((_, i) => i)));
        setState('ok');
        api(`/reports/${id}/opened`, { method: 'POST' }).catch(() => {});
      } catch { setState('error'); }
    })();
  }, [id, s.org]);

  async function kill() {
    if (!p) return;
    const indicators = p.raw_indicators.filter((_, i) => pick.has(i)).filter((x) => ['upi', 'tel', 'host', 'app'].includes(x.t)).map((x) => {
      const n = normalize(x.t, x.value);
      return { t: x.t, h: n.h, label: maskedLabel(x.t, n.canonical) };
    });
    if (!indicators.length) return;
    const r = await api<{ blocked_reports: number }>('/kill', { method: 'POST', body: JSON.stringify({ bank_id: s.org, indicators }) });
    setMsg(`Blocked for all SATYA users. ${r.blocked_reports} report${r.blocked_reports === 1 ? '' : 's'} closed.`);
    setRow({ ...row, status: 'blocked' });
  }

  return (
    <Shell title="Case review" sub="Opened in this browser with your bank’s private key. SATYA’s servers only ever held the sealed box." actions={<Link className="btn-ghost" href="/radar">Back to Radar</Link>}>
      {state === 'loading' && <div className="card p-8 text-muted">Opening the sealed report…</div>}
      {state === 'nokeys' && <div className="card p-8">This browser doesn’t hold {s.orgName}’s keys yet. <Link className="font-semibold text-blue underline" href="/keys">Import them</Link>, then come back.</div>}
      {state === 'error' && <div className="card p-8">This report can’t be opened here (not found, or sealed to a different key).</div>}
      {p && row && (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="card relative p-6">
            {row.status === 'blocked' && <div className="stamp-in absolute right-6 top-6 rounded-xl bg-paper/90 p-1"><span className="stamp stamp-big !text-blue !border-blue">Confirmed fake</span></div>}
            <div className="micro">Sealed report · {row.id.slice(0, 8)} · sha256 {row.sealed_hash.slice(0, 10)}…</div>
            <div className="mt-4 micro">Sender</div>
            <div className="text-lg font-semibold">{p.sender || '—'} <span className="text-sm font-normal text-muted">· {p.channel} · {p.source_app}</span></div>
            <div className="mt-5 micro">Message (customer’s details masked on their phone)</div>
            <div className="mt-2 rounded-2xl bg-evidence p-3"><div className="max-w-[90%] rounded-[4px_14px_14px_14px] bg-white px-3 py-2 text-[15px] leading-relaxed">{p.masked_text}</div></div>
            <div className="mt-5 micro">Promises broken</div>
            <div className="mt-2 space-y-3">
              {p.rule_hits.map((h) => (
                <div key={h.id} className="flex items-start gap-3"><span className="stamp">{h.severity}</span><div><div className="font-semibold">{h.id}{h.ai_assisted ? ' · AI-assisted' : ''}</div>{h.promise && <div className="text-sm italic text-body2">“{h.promise}”</div>}{h.source && <a className="text-xs font-semibold text-blue" href={h.source} target="_blank" rel="noreferrer">Source</a>}</div></div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-dashed border-ink/10 pt-4 text-sm md:grid-cols-4">
              <div><div className="micro">Seen 7d</div><div className="font-semibold">{p.herd?.seen_7d ?? 0}</div></div>
              <div><div className="micro">Reports</div><div className="font-semibold">{p.herd?.reports ?? 0}</div></div>
              <div><div className="micro">Face score</div><div className="font-semibold">{p.scores?.face ?? '—'}</div></div>
              <div><div className="micro">Voice score</div><div className="font-semibold">{p.scores?.voice ?? '—'}</div></div>
            </div>
            <div className="mt-5 micro">Timeline</div>
            <ul className="mt-2 space-y-1 text-sm">{p.timeline.map((t, i) => <li key={i}><span className="font-semibold">{new Date(t.t).toLocaleString('en-IN')}</span> · {t.event}</li>)}</ul>
            {p.callback_number && <div className="mt-4 text-sm"><span className="micro">Callback</span><div className="font-semibold">{p.callback_number}</div></div>}
            {p.screenshot_jpeg_b64 && <img className="mt-4 max-h-96 rounded-xl border" alt="Masked screenshot" src={`data:image/jpeg;base64,${p.screenshot_jpeg_b64}`} />}
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">One-Click Kill</div>
              <p className="mt-1 text-sm text-body2">Confirms these values are not yours. Every SATYA phone treats them as fake at once; the server receives only their fingerprints and masked labels.</p>
              <div className="mt-3 space-y-2">
                {p.raw_indicators.map((x, i) => (
                  <label key={i} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2">
                    <input type="checkbox" checked={pick.has(i)} onChange={() => setPick((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                    <span className="text-xs font-bold uppercase text-muted">{x.t}</span><span className="font-semibold break-all">{x.value}</span>
                  </label>
                ))}
              </div>
              <button className="btn-ink mt-4 w-full" disabled={row.status === 'blocked' || !pick.size} onClick={kill}>{row.status === 'blocked' ? 'Blocked' : 'Kill: block for everyone'}</button>
              {msg && <p className="mt-3 text-sm font-semibold">{msg}</p>}
            </div>
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">Dismiss</div>
              <p className="mt-1 text-sm text-body2">Close without blocking. The sealed copy is deleted 30 days after closing.</p>
              <button className="btn-ghost mt-3 w-full" disabled={row.status !== 'delivered' && row.status !== 'opened'} onClick={async () => { await api(`/reports/${id}/dismiss`, { method: 'POST' }); setRow({ ...row, status: 'dismissed' }); }}>Dismiss report</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
