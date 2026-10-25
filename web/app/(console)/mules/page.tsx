'use client';
import { useCallback, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api } from '@/lib/console/client';
import { count } from '@/lib/console/format';
import { herdCounts, type HerdCount } from '@/lib/console/herd';
import { useSession } from '@/lib/console/session';
import { usePoll } from '@/lib/console/usePoll';
import { sampleAccounts } from '@/lib/demo';
import { normalize, type IndicatorType } from '@/lib/satya/normalize';

type Action = 'frozen' | 'investigating' | 'not_ours';
interface Alert { h: string; t: string; label: string; by: string; at: string; demo: boolean; reports: number; seen_7d: number; action: { action: Action; at: string; user: string } | null }
interface Match { line: string; t: IndicatorType; state: 'confirmed' | 'reported' | 'clear' | 'invalid'; by?: string; reports?: number }

const ACTIONS: [Action, string][] = [['frozen', 'Frozen'], ['investigating', 'Investigating'], ['not_ours', 'Not our account']];
const DONE: Record<Action, string> = { frozen: 'Account frozen', investigating: 'Under investigation', not_ours: 'Not our account' };

/** One line of the bank's own list: a UPI ID, or an account number with its IFSC. */
function parse(line: string): { t: IndicatorType; raw: string } | null {
  const s = line.trim();
  if (!s) return null;
  if (s.includes('@')) return { t: 'upi', raw: s };
  const acc = s.match(/\d{9,18}/)?.[0];
  const ifsc = s.toUpperCase().match(/[A-Z]{4}0[A-Z0-9]{6}/)?.[0];
  return acc && ifsc ? { t: 'acct', raw: `${acc}/${ifsc}` } : null;
}

/** Mule Watch: scam accounts held at this bank, found by the network and matched in this browser. */
export default function Mules() {
  const s = useSession();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [list, setList] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => { api<{ items: Alert[] }>('/console/mules').then((r) => setAlerts(r.items)).catch(() => setAlerts([])); }, []);
  usePoll(load, 30_000);

  async function act(h: string, action: Action) {
    try { await api('/console/mules', { method: 'POST', body: JSON.stringify({ h, action }) }); load(); }
    catch (e) { setMsg(`Couldn’t record that (${(e as Error).message}).`); }
  }

  async function match() {
    setBusy(true); setMsg('');
    try {
      const lines = list.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
      const parsed = lines.map((line) => { const p = parse(line); return { line, p, ind: p ? normalize(p.t, p.raw) : null }; });
      const hashes = parsed.flatMap((x) => (x.ind ? [x.ind.h] : []));
      const [block, herd] = await Promise.all([
        api<{ items: { h: string; by: string }[] }>('/kill').then((r) => new Map(r.items.map((b) => [b.h, b.by]))),
        hashes.length ? herdCounts(hashes) : Promise.resolve(new Map<string, HerdCount>()),
      ]);
      setMatches(parsed.map(({ line, p, ind }): Match => {
        if (!p || !ind) return { line, t: 'upi', state: 'invalid' };
        const by = block.get(ind.h) ?? herd.get(ind.h)?.confirmed_by ?? undefined;
        const reports = herd.get(ind.h)?.reports ?? 0;
        return { line, t: p.t, state: by ? 'confirmed' : reports ? 'reported' : 'clear', by, reports };
      }).sort((a, b) => ['confirmed', 'reported', 'invalid', 'clear'].indexOf(a.state) - ['confirmed', 'reported', 'invalid', 'clear'].indexOf(b.state)));
    } catch (e) { setMsg(`Couldn’t match (${(e as Error).message}).`); }
    setBusy(false);
  }

  const open = (alerts ?? []).filter((a) => !a.action);
  return (
    <Shell kind="bank" title="Mule Watch" sub={`Scam receiving accounts held at ${s.orgName}, confirmed fake by any bank on SATYA. Mule accounts are where the money lands: freezing one stops the next victim’s transfer.`}>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div className="font-display text-lg font-semibold">At your bank</div>
            <div className="text-sm text-muted">{count(open.length)} need{open.length === 1 ? 's' : ''} action</div>
          </div>
          {!alerts && <div className="card p-8 text-muted">Loading…</div>}
          {alerts && !alerts.length && <Empty>No confirmed scam accounts at {s.org} yet. When any bank blocks a UPI ID or account whose handle or IFSC is yours, it appears here.</Empty>}
          <div className="space-y-3">
            {(alerts ?? []).map((a) => (
              <div key={a.h} className={`card p-5 ${a.action ? 'opacity-80' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-semibold break-all">{a.label}</div>
                    <div className="text-sm text-muted">Confirmed fake by {a.by} · {ago(a.at)}{a.demo ? ' · Demo' : ''}</div>
                  </div>
                  <span className="stamp">{a.action ? DONE[a.action.action] : 'Needs action'}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-paper p-3 text-sm">
                  <div><div className="micro">Reports, all banks</div><div className="font-semibold tabular-nums">{count(a.reports)}</div></div>
                  <div><div className="micro">Phones, 7 days</div><div className="font-semibold tabular-nums">{count(a.seen_7d)}</div></div>
                </div>
                {a.action
                  ? <p className="mt-3 text-sm text-body2">{DONE[a.action.action]} by {a.action.user}, {ago(a.action.at)}. Recorded in the audit trail.</p>
                  : <div className="mt-3 flex flex-wrap gap-2">{ACTIONS.map(([k, label]) => <button key={k} className={k === 'frozen' ? 'btn-ink' : 'btn-ghost'} onClick={() => act(a.h, k)}>{label}</button>)}</div>}
              </div>
            ))}
          </div>
          {msg && <p role="status" className="mt-3 text-sm font-semibold">{msg}</p>}
        </div>

        <div className="card h-fit p-5">
          <div className="font-display text-lg font-semibold">Check your own accounts, privately</div>
          <p className="mt-1 text-sm text-body2">Paste UPI IDs, or account numbers with their IFSC, one per line. They are hashed in this browser; only 5-character prefixes are sent, so SATYA never learns which accounts you hold.</p>
          <textarea className="field mt-3 !h-44 font-mono text-sm" value={list} onChange={(e) => setList(e.target.value)} placeholder={'priya.sharma@oksbi\n50100123456780, HDFC0001234'} aria-label="Your accounts" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-ink" disabled={busy || !list.trim()} onClick={match}>{busy ? 'Matching…' : 'Match against SATYA'}</button>
            <button className="btn-ghost" onClick={() => { setList(sampleAccounts(s.org).join('\n')); setMatches(null); }}>Load sample list</button>
          </div>
          {matches && (
            <div className="mt-4 divide-y divide-ink/5 rounded-2xl border border-ink/5">
              {matches.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 break-all font-mono">{m.line}</span>
                  <span className={`shrink-0 text-right ${m.state === 'clear' ? 'text-muted' : 'font-semibold'}`}>
                    {m.state === 'confirmed' ? `Confirmed fake by ${m.by}: freeze` : m.state === 'reported' ? `Reported ${m.reports}×: investigate` : m.state === 'invalid' ? 'Not a UPI ID or account + IFSC' : 'No SATYA reports'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
