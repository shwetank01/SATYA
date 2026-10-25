'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Bars, Columns } from '@/components/charts';
import { Shell } from '@/components/ui';
import { api } from '@/lib/console/client';
import { count, duration, inr, shortDay } from '@/lib/console/format';
import { lossAvoided, type BankMetrics } from '@/lib/console/metrics';
import { useSession } from '@/lib/console/session';
import { usePoll } from '@/lib/console/usePoll';

type M = BankMetrics & { avg_loss_inr: number };

const CHANNEL: Record<string, string> = { sms: 'SMS', whatsapp: 'WhatsApp', call: 'Call', email: 'Email', screen: 'Screen', video: 'Video call', voice: 'Voice note', app: 'App' };
const SEV: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', none: 'None' };

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </div>
  );
}

/** The fraud desk's value in one screen: volume, speed, protection, and what it is worth. */
export default function Overview() {
  const s = useSession();
  const [m, setM] = useState<M | null>(null);
  const [err, setErr] = useState('');
  const [oneIn, setOneIn] = useState(10);
  const load = useCallback(() => { api<M>('/console/metrics').then((r) => { setM(r); setErr(''); }).catch((e) => setErr(e.message)); }, []);
  usePoll(load, 60_000);

  const delta = m && m.reports_prev_30d ? Math.round(((m.reports_30d - m.reports_prev_30d) / m.reports_prev_30d) * 100) : null;
  const avoided = m ? lossAvoided(m.phones_warned, oneIn) : 0;

  return (
    <Shell
      kind="bank"
      title="Fraud overview"
      sub={`What SATYA did for ${s.orgName} in the last 30 days: reports received, how fast your desk acted, and how many customers your blocks warned.`}
      actions={<a className="btn-ghost" href="/api/v1/console/export">Download case register (CSV)</a>}
    >
      {err && <div className="card p-6 font-semibold">Couldn’t load the overview ({err}).</div>}
      {!m && !err && <div className="card p-8 text-muted">Loading…</div>}
      {m && (
        <div className="space-y-5">
          <div className="grain lattice relative overflow-hidden rounded-[22px] bg-blue p-6 text-paper shadow-[0_10px_26px_rgba(14,35,72,.12)] md:p-8" style={{ backgroundBlendMode: 'soft-light' }}>
            <div className="text-sm font-semibold text-paper/80">Estimated loss avoided by your blocks</div>
            <div className="mt-2 font-display text-5xl font-semibold tracking-tight tabular-nums md:text-6xl">{inr(avoided)}</div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/85">
              {count(m.phones_warned)} SATYA phone check{m.phones_warned === 1 ? '' : 's'} hit a value you blocked and showed “Confirmed fake by {s.org}”.
              If 1 in{' '}
              <input aria-label="One in how many warned customers would have paid" type="number" min={1} max={1000} value={oneIn}
                onChange={(e) => setOneIn(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
                className="w-16 rounded-lg border border-white/40 bg-white/15 px-2 py-0.5 text-center font-semibold text-paper" />{' '}
              of them would otherwise have paid, at {inr(m.avg_loss_inr)} per reported fraud (I4C, 2024), that is {inr(avoided)}.
            </p>
            <p className="mt-2 text-xs text-paper/65">The 1-in-N figure is your assumption, not a measurement. Change it to match your own fraud data.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Reports, 30 days" value={count(m.reports_30d)} note={delta === null ? `${count(m.reports_7d)} in the last 7 days` : `${delta >= 0 ? '+' : ''}${delta}% vs the 30 days before`} />
            <Tile label="Open cases" value={count(m.open)} note={`${count(m.unread)} not opened yet`} />
            <Tile label="Median time to act" value={duration(m.median_minutes_to_action)} note={`report to block or dismiss, ${count(m.closed_30d)} closed`} />
            <Tile label="Values you blocked" value={count(m.blocked_by_you)} note={`${count(m.blocked_network)} across all banks`} />
            <Tile label="Customers warned" value={count(m.phones_warned)} note="checks that met your blocks, last 8 days" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">Reports per day</div>
              <div className="text-sm text-muted">Last 14 days, every channel</div>
              <div className="mt-2"><Columns label="Reports" data={m.by_day.map((d) => ({ key: d.day, n: d.n, label: shortDay(d.day) }))} /></div>
            </div>
            <div className="card space-y-5 p-5">
              <div>
                <div className="font-display text-lg font-semibold">Where scams reach customers</div>
                <div className="mb-3 text-sm text-muted">Reports by channel, 30 days</div>
                {m.by_channel.length ? <Bars data={m.by_channel.map((c) => ({ key: c.key, n: c.n, label: CHANNEL[c.key] ?? c.key }))} /> : <p className="text-sm text-muted">No reports yet.</p>}
              </div>
              <div>
                <div className="micro">Severity</div>
                <div className="mt-2 flex flex-wrap gap-2">{m.by_severity.map((x) => <span key={x.key} className="stamp">{SEV[x.key] ?? x.key} · {x.n}</span>)}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>Updated {new Date(m.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{m.demo_rows ? ` · includes ${m.demo_rows} demo report${m.demo_rows === 1 ? '' : 's'}` : ''}. The CSV holds tags only; report contents stay sealed.</span>
            <Link className="font-semibold text-blue underline" href="/inbox">Open the inbox</Link>
          </div>
        </div>
      )}
    </Shell>
  );
}
