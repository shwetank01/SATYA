'use client';
import { useEffect, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';

export default function Blocklist() {
  const s = useSession();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api<{ items: any[] }>('/kill').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  return (
    <Shell title="Blocklist" sub={`Values ${s.orgName} confirmed as fake. Every SATYA phone gets them at its next sync, and a live herd lookup flags them at once.`}>
      {items && !items.length && <Empty>Nothing blocked yet. Use Kill on a case to block a scammer’s UPI ID, number or site for everyone.</Empty>}
      <div className="card divide-y divide-ink/5">
        {items?.map((i) => (
          <div key={i.hash} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div><div className="font-semibold">{i.label || i.type}</div><div className="text-xs text-muted">fingerprint {i.hash.slice(0, 12)}… · {i.reports} report{i.reports === 1 ? '' : 's'}</div></div>
            <div className="flex items-center gap-3 text-sm text-muted"><span className="stamp">{i.type}</span>{i.confirmed_at && ago(i.confirmed_at)}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
