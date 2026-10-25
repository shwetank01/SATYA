'use client';
import { useCallback, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';
import { usePoll } from '@/lib/console/usePoll';
import { actionWord } from '@/lib/console/words';

interface Entry { at: string; user: string; action: string; target?: string; detail?: string }

/** Every action taken in this console, newest first: the record an auditor or regulator asks for. */
export default function Audit() {
  const s = useSession();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [who, setWho] = useState('all');
  const load = useCallback(() => { api<{ items: Entry[] }>('/console/audit').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  usePoll(load, 30_000);
  const people = [...new Set((items ?? []).map((i) => i.user))];
  const shown = (items ?? []).filter((i) => who === 'all' || i.user === who);
  return (
    <Shell title="Audit trail" sub={`Every sign-in, opened report, block, publication and payment decision at ${s.orgName}, with who did it and when. Kept by the gateway; entries are never edited.`}>
      {people.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', ...people].map((p) => (
            <button key={p} onClick={() => setWho(p)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${who === p ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{p === 'all' ? 'Everyone' : p}</button>
          ))}
        </div>
      )}
      {!items && <div className="card p-8 text-muted">Loading…</div>}
      {items && !shown.length && <Empty>Nothing recorded yet.</Empty>}
      {!!shown.length && (
        <div className="card divide-y divide-ink/5 overflow-hidden">
          {shown.map((e, i) => (
            <div key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5">
              <div className="w-40 shrink-0 text-sm text-muted" title={e.at}>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}<div className="text-xs">{ago(e.at)}</div></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{actionWord(e.action)}</div>
                {(e.target || e.detail) && <div className="break-words text-sm text-body2">{[e.target, e.detail].filter(Boolean).join(' · ')}</div>}
              </div>
              <span className="text-sm font-semibold">{e.user}</span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
