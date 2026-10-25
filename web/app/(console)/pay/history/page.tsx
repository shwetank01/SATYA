'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Empty, Shell } from '@/components/ui';
import { api } from '@/lib/console/client';
import { channelName, DECISION, type PayRecord } from '@/lib/console/pay';
import { usePoll } from '@/lib/console/usePoll';

const FILTERS = [['all', 'All'], ['hold', 'On hold'], ['blocked', 'Blocked'], ['released', 'Released'], ['clear', 'Clear']] as const;

/** Every Pay Check decision, newest first; each one opens to its signed Evidence PDF. */
export default function PayHistory() {
  const [items, setItems] = useState<PayRecord[] | null>(null);
  const [filter, setFilter] = useState('all');
  const load = useCallback(() => { api<{ items: PayRecord[] }>('/pay/checks').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  usePoll(load, 30_000);
  const shown = (items ?? []).filter((r) => filter === 'all' || r.decision === filter);
  return (
    <Shell kind="company" title="Payment decisions" sub="Every request checked, with who checked it, the reasons and the callback. Each record has a signed Evidence PDF for auditors, insurers and the police." actions={<Link className="btn-ink" href="/pay/check">Check a payment</Link>}>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === k ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{l}</button>)}
      </div>
      {!items && <div className="card p-8 text-muted">Loading…</div>}
      {items && !shown.length && <Empty>No payment checks here yet.</Empty>}
      {!!shown.length && (
        <div className="card divide-y divide-ink/5 overflow-hidden">
          {shown.map((r) => (
            <Link key={r.id} href={`/pay/check/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-paper">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.summary}</div>
                <div className="text-sm text-muted">{r.requester} · {channelName(r.channel)} · {r.flags.length} flag{r.flags.length === 1 ? '' : 's'}{r.demo ? ' · Demo' : ''}</div>
              </div>
              <span className="stamp">{DECISION[r.decision]}</span>
              <span className="w-28 text-right text-sm text-muted">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
