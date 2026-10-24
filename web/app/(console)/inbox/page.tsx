'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api, forgetKeys, getKeys, importKeys } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';

interface Row { id: string; channel: string; rules: string[]; severity: string; received_at: string; status: string; indicator_count: number }

const STATUS: Record<string, string> = { delivered: 'New', opened: 'Opened', blocked: 'Blocked', dismissed: 'Closed' };
const FILTERS = [['open', 'Open'], ['all', 'All'], ['blocked', 'Blocked'], ['dismissed', 'Closed']] as const;

/** Feature 1: sealed reports from SATYA phones, opened only in this browser with the bank's Box key. */
export default function Inbox() {
  const s = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<string>('open');
  const [keyPk, setKeyPk] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<{ items: Row[] }>('/reports').then((r) => { setRows(r.items); setErr(''); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { getKeys(s.org).then((k) => setKeyPk(k?.box?.pk ?? null)); }, [s.org, msg]);

  const shown = (rows ?? []).filter((r) => filter === 'all' || (filter === 'open' ? r.status === 'delivered' || r.status === 'opened' : r.status === filter));
  const fresh = (rows ?? []).filter((r) => r.status === 'delivered').length;

  return (
    <Shell
      title="Report Inbox"
      sub={`Customers report from the SATYA app. Each report is sealed on their phone with ${s.orgName}’s public key; the gateway only stores the sealed box.`}
      actions={<button className="btn-ghost" onClick={load}>Refresh</button>}
    >
      <div className="mb-5 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue" aria-hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F3EE" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{keyPk ? 'Box key loaded in this browser' : 'Load your Box key to open reports'}</div>
            <div className="truncate text-sm text-muted">{keyPk ? `public ${keyPk.slice(0, 16)}…` : 'Import keys/demo_keys.json. Only this bank’s key is kept, in IndexedDB; it never leaves the browser.'}</div>
          </div>
          {keyPk ? (
            <button className="btn-ghost" onClick={async () => { await forgetKeys(s.org); setMsg('forgot ' + Date.now()); }}>Forget key</button>
          ) : (
            <label className="btn-ink cursor-pointer">
              Import key file
              <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const ok = await importKeys(await f.text(), s.org).catch(() => false);
                setMsg(ok ? `Imported ${s.org}’s Box key.` : `That file has no Box key for ${s.org}.`);
              }} />
            </label>
          )}
        </div>
        <div className="card flex items-center gap-3 px-5 py-4">
          <div className="font-display text-4xl font-light text-ink">{fresh}</div>
          <div className="text-sm font-semibold text-muted">new<br />reports</div>
        </div>
      </div>
      {msg && !msg.startsWith('forgot') && <p className="mb-4 text-sm font-semibold">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === id ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{label}</button>
        ))}
      </div>

      {err && <Empty>Couldn’t load reports ({err}).</Empty>}
      {rows && !err && !shown.length && <Empty>No reports here yet. When a SATYA user taps “Report to {s.org}” on a receipt, it lands here within seconds.</Empty>}
      {!rows && !err && <div className="card p-8 text-muted">Loading…</div>}
      {!!shown.length && (
        <div className="card divide-y divide-ink/5 overflow-hidden">
          {shown.map((r) => (
            <Link key={r.id} href={`/case/${r.id}`} className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-paper">
              {r.status === 'delivered' ? <span className="live-dot" aria-label="new" /> : <span className="h-2 w-2" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{r.rules.length ? r.rules.join(' · ') : 'No rule id (AI-flagged)'}</div>
                <div className="text-sm text-muted">{r.channel} · {r.indicator_count} scammer value{r.indicator_count === 1 ? '' : 's'} · report {r.id.slice(0, 8)}</div>
              </div>
              <span className="stamp">{r.severity}</span>
              <span className="w-20 text-right text-sm font-semibold">{STATUS[r.status] ?? r.status}</span>
              <span className="w-20 text-right text-sm text-muted">{ago(r.received_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}
