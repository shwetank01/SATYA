'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api, supabase } from '@/lib/console/client';
import { groupCampaigns, type ReportRow } from '@/lib/console/campaigns';
import { useSession } from '@/lib/console/session';

const COLS = 'id,bank_id,channel,rules,severity,indicator_hashes,status,received_at,seeded';

/** I2 Impersonation Radar: live reports grouped into campaigns. Realtime, or 5 s polling if it won't subscribe. */
export default function Radar() {
  const s = useSession();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, { seen_7d: number; reports: number; confirmed_by: string | null }>>({});
  const [mode, setMode] = useState<'realtime' | 'polling' | 'connecting'>('connecting');
  const known = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data } = await supabase().from('reports').select(COLS).eq('bank_id', s.org).gte('received_at', since).order('received_at', { ascending: false }).limit(500);
    const list = (data ?? []) as ReportRow[];
    const added = list.filter((r) => known.current.size && !known.current.has(r.id)).map((r) => r.id);
    list.forEach((r) => known.current.add(r.id));
    if (added.length) setFresh((f) => new Set([...f, ...added]));
    setRows(list);
  }, [s.org]);

  useEffect(() => {
    load();
    let poll: ReturnType<typeof setInterval> | null = null;
    const ch = supabase().channel('radar-' + s.org)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports', filter: `bank_id=eq.${s.org}` }, () => load())
      .subscribe((status) => { if (status === 'SUBSCRIBED') setMode('realtime'); });
    const fallback = setTimeout(() => {
      setMode((m) => {
        if (m !== 'realtime') { poll = setInterval(load, 5000); return 'polling'; }
        return m;
      });
    }, 5000);
    return () => { clearTimeout(fallback); if (poll) clearInterval(poll); supabase().removeChannel(ch); };
  }, [s.org, load]);

  const campaigns = useMemo(() => groupCampaigns(rows), [rows]);
  useEffect(() => {
    const hashes = [...new Set(campaigns.flatMap((c) => c.hashes))].slice(0, 200);
    if (hashes.length) api('/herd/counts', { method: 'POST', body: JSON.stringify({ hashes }) }).then(setCounts).catch(() => {});
  }, [campaigns]);

  return (
    <Shell
      title="Impersonation Radar"
      sub={`Reports sent to ${s.orgName} from SATYA phones in the last 7 days, grouped into campaigns by the scammer’s UPI IDs, numbers and sites.`}
      actions={<span className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-sm font-semibold">{mode === 'realtime' ? <><span className="live-dot" />Live</> : mode === 'polling' ? 'Refreshing every 5 s' : 'Connecting…'}</span>}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Reports', rows.length],
          ['Campaigns', campaigns.length],
          ['Unread', rows.filter((r) => r.status === 'delivered').length],
          ['Blocked', rows.filter((r) => r.status === 'blocked').length],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4"><div className="micro">{k}</div><div className="mt-2 font-display text-4xl font-light tracking-tight">{v}</div></div>
        ))}
      </div>
      {!campaigns.length && <Empty>No reports yet. When a SATYA user reports a message that breaks your promises, it appears here within seconds.</Empty>}
      <div className="grid gap-4 xl:grid-cols-2">
        {campaigns.map((c) => {
          const seen = Math.max(0, ...c.hashes.map((h) => counts[h]?.seen_7d ?? 0));
          const confirmed = c.hashes.map((h) => counts[h]?.confirmed_by).find(Boolean);
          const isNew = c.reports.some((r) => fresh.has(r.id));
          return (
            <div key={c.key} className={`card p-5 ${isNew ? 'card-in ring-2 ring-yellow' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="micro">Campaign · {c.channels.join(', ')}</div>
                  <div className="mt-1 font-display text-2xl font-semibold">{c.reports.length} report{c.reports.length > 1 ? 's' : ''}</div>
                  <div className="text-sm text-muted">Last {ago(c.last)} · seen by {seen} SATYA phone{seen === 1 ? '' : 's'} this week</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="stamp">{c.severity}</span>
                  <span className="stamp">{c.status === 'blocked' ? 'Blocked' : c.status === 'live' ? `${c.open} open` : 'Closed'}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{c.topRules.map((r) => <span key={r} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-body2">{r}</span>)}</div>
              {confirmed && <div className="mt-3 text-sm font-semibold">Confirmed fake by {confirmed} · blocked for every SATYA user</div>}
              <div className="mt-4 divide-y divide-ink/5 rounded-2xl border border-ink/5">
                {c.reports.slice(0, 5).map((r) => (
                  <Link key={r.id} href={`/case/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-paper">
                    <span className="font-semibold">{r.channel.toUpperCase()} · {new Date(r.received_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-muted">{r.status}{r.seeded ? ' · seed' : ''}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
