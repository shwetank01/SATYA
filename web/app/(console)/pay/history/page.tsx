'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { supabase } from '@/lib/console/client';
import { inr } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';

export default function History() {
  const s = useSession();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { supabase().from('pay_checks').select('*').eq('org_id', s.org).order('created_at', { ascending: false }).limit(200).then(({ data }) => setRows(data ?? [])); }, [s.org]);
  return (
    <Shell title="Pay Check history" sub="Every request checked, with its decision. Request files never left the browser that checked them.">
      {rows && !rows.length && <Empty>No payment requests checked yet.</Empty>}
      <div className="card divide-y divide-ink/5">
        {rows?.map((r) => (
          <Link key={r.id} href={`/pay/check/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-paper">
            <div><div className="font-semibold">{r.requester} · {inr(r.amount_inr)}</div><div className="text-xs text-muted">{r.channel} · {(r.flags ?? []).length} flag{(r.flags ?? []).length === 1 ? '' : 's'} · {ago(r.created_at)}</div></div>
            <span className="stamp">{r.decision}</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
