'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { groupCampaigns, type RadarRow } from '@/lib/console/campaigns';
import { api } from '@/lib/console/client';
import { count } from '@/lib/console/format';
import { herdCounts, type HerdCount } from '@/lib/console/herd';
import { ruleName } from '@/lib/console/ruleNames';
import { useSession } from '@/lib/console/session';
import { usePoll } from '@/lib/console/usePoll';

const WINDOWS = [[7, '7 days'], [30, '30 days']] as const;
const CHANNEL: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', call: 'Call', email: 'Email', screen: 'Screen', video: 'Video call', voice: 'Voice note', app: 'App' };

/** I2 Impersonation Radar: reports grouped into campaigns by the scammer values they share. */
export default function Radar() {
  const s = useSession();
  const [rows, setRows] = useState<RadarRow[] | null>(null);
  const [days, setDays] = useState<number>(7);
  const [counts, setCounts] = useState<Map<string, HerdCount>>(new Map());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(() => {
    api<{ items: RadarRow[] }>('/reports').then((r) => {
      const seen = known.current;
      if (seen) { const added = r.items.filter((x) => !seen.has(x.id)).map((x) => x.id); if (added.length) setFresh((f) => new Set([...f, ...added])); }
      known.current = new Set(r.items.map((x) => x.id));
      setRows(r.items);
    }).catch(() => setRows([]));
  }, []);
  usePoll(load, 15_000);

  const inWindow = useMemo(() => (rows ?? []).filter((r) => Date.parse(r.received_at) > Date.now() - days * 86_400_000), [rows, days]);
  const campaigns = useMemo(() => groupCampaigns(inWindow), [inWindow]);
  const hashKey = useMemo(() => [...new Set(campaigns.flatMap((c) => c.hashes))].sort().join(','), [campaigns]);
  useEffect(() => {
    if (!hashKey) return;
    herdCounts(hashKey.split(',')).then(setCounts).catch(() => {});
  }, [hashKey]);

  const multi = campaigns.filter((c) => c.reports.length > 1);
  const live = campaigns.filter((c) => c.status === 'live');

  return (
    <Shell
      kind="bank"
      title="Impersonation Radar"
      sub={`Reports to ${s.orgName} grouped into campaigns by the scammer’s UPI IDs, numbers, sites and apps. One campaign is one operation to stop, however many customers it reached.`}
      actions={
        <div className="flex gap-2" role="tablist" aria-label="Time window">
          {WINDOWS.map(([d, label]) => <button key={d} role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${days === d ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{label}</button>)}
        </div>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Reports', inWindow.length],
          ['Campaigns', campaigns.length],
          ['Repeat campaigns', multi.length],
          ['Live, needs action', live.length],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4"><div className="text-sm font-semibold text-muted">{k}</div><div className="mt-1.5 font-display text-3xl font-semibold tabular-nums">{count(v as number)}</div></div>
        ))}
      </div>
      {!rows && <div className="card p-8 text-muted">Loading…</div>}
      {rows && !campaigns.length && <Empty>No reports in the last {days} days. When SATYA users report messages that break your promises, they appear here, grouped by the scammer behind them.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {campaigns.map((c) => {
          const hs = c.hashes.map((h) => counts.get(h)).filter(Boolean) as HerdCount[];
          const seen = Math.max(0, ...hs.map((x) => x.seen_7d));
          const network = Math.max(c.reports.length, ...hs.map((x) => x.reports));
          const confirmed = hs.find((x) => x.confirmed_by);
          const label = hs.find((x) => x.label)?.label;
          const isNew = c.reports.some((r) => fresh.has(r.id));
          return (
            <div key={c.key} className={`card p-5 ${isNew ? 'card-in ring-2 ring-yellow' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="micro">{c.channels.map((x) => CHANNEL[x] ?? x).join(' · ')}{c.reports.some((r) => r.demo) ? ' · Demo' : ''}</div>
                  <div className="mt-1 font-display text-xl font-semibold leading-snug">{c.topRules.length ? ruleName(c.topRules[0]) : 'Flagged by SATYA AI'}</div>
                  <div className="mt-0.5 text-sm text-muted">{c.reports.length} report{c.reports.length === 1 ? '' : 's'} to you · first {ago(c.first)}, last {ago(c.last)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="stamp">{c.severity}</span>
                  <span className="stamp">{c.status === 'blocked' ? 'Blocked' : c.status === 'live' ? `${c.open} open` : 'Closed'}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 rounded-2xl bg-paper p-3 text-sm">
                <div><div className="micro">Phones, 7d</div><div className="font-semibold tabular-nums">{count(seen)}</div></div>
                <div><div className="micro">All banks</div><div className="font-semibold tabular-nums">{count(network)} report{network === 1 ? '' : 's'}</div></div>
                <div><div className="micro">Values</div><div className="font-semibold tabular-nums">{c.hashes.length}</div></div>
              </div>
              {c.topRules.length > 1 && <div className="mt-3 flex flex-wrap gap-1.5">{c.topRules.slice(1).map((r) => <span key={r} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-body2">{ruleName(r)}</span>)}</div>}
              {confirmed && <div className="mt-3 text-sm font-semibold">{label ? `${label} · ` : ''}confirmed fake by {confirmed.confirmed_by === s.org ? 'you' : confirmed.confirmed_by}, blocked on every SATYA phone</div>}
              <div className="mt-4 divide-y divide-ink/5 rounded-2xl border border-ink/5">
                {c.reports.slice(0, 4).map((r) => (
                  <Link key={r.id} href={`/case/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper">
                    <span className="font-semibold">{CHANNEL[r.channel] ?? r.channel} · {new Date(r.received_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-muted">{({ delivered: 'New', opened: 'Opened', blocked: 'Blocked', dismissed: 'Closed' } as Record<string, string>)[r.status] ?? r.status}</span>
                  </Link>
                ))}
                {c.reports.length > 4 && <div className="px-3 py-2 text-xs text-muted">and {c.reports.length - 4} more in the inbox</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
