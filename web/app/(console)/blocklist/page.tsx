'use client';
import { useCallback, useEffect, useState } from 'react';
import { Empty, Shell, ago } from '@/components/ui';
import { api } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';
import { maskedLabel, normalize } from '@/lib/satya/normalize';

interface Item { h: string; t: string; by: string; label: string; at: string }
type Kind = 'upi' | 'tel' | 'host';
const KINDS: [Kind, string, string][] = [['upi', 'UPI ID', 'sbi.kyc.help@ybl'], ['tel', 'Phone number', '+91 98765 43210'], ['host', 'Website', 'sbi-kyc-update.in']];

/** Feature 3: values confirmed fake. Every SATYA phone gets them at its next sync (about 15 minutes). */
export default function Blocklist() {
  const s = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>('upi');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => { api<{ items: Item[] }>('/kill').then((r) => setItems(r.items)).catch(() => setItems([])); }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    const n = normalize(kind, v);
    try {
      await api('/kill', { method: 'POST', body: JSON.stringify({ indicators: [{ t: kind, h: n.h, label: maskedLabel(kind, n.canonical) }] }) });
      setMsg(`Blocked ${maskedLabel(kind, n.canonical)}. The raw value never left this browser; only its fingerprint did.`);
      setValue(''); load();
    } catch (err) { setMsg(`Couldn’t block (${(err as Error).message}).`); }
  }

  return (
    <Shell title="Blocklist" sub={`Scammer values confirmed fake by a bank. SATYA phones flag them instantly after their next sync, even with the app closed. ${s.orgName} adds from a case or here.`}>
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-5" onSubmit={add}>
        <div>
          <label htmlFor="kind" className="micro">Type</label>
          <select id="kind" className="field mt-1.5 w-44" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label htmlFor="val" className="micro">Value</label>
          <input id="val" className="field mt-1.5" value={value} onChange={(e) => setValue(e.target.value)} placeholder={KINDS.find((k) => k[0] === kind)![2]} />
        </div>
        <button className="btn-ink" disabled={!value.trim()}>Block for everyone</button>
        {msg && <p role="status" className="w-full text-sm font-semibold">{msg}</p>}
      </form>
      {items && !items.length && <Empty>Nothing blocked yet. Block a scammer’s UPI ID, number or site from a case, or add one above.</Empty>}
      {!!items?.length && (
        <div className="card divide-y divide-ink/5">
          {items.map((i) => (
            <div key={i.h} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div><div className="font-semibold">{i.label || i.t}</div><div className="text-xs text-muted">fingerprint {i.h.slice(0, 12)}… · confirmed by {i.by}</div></div>
              <div className="flex items-center gap-3 text-sm text-muted"><span className="stamp">{i.t}</span>{ago(i.at)}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
