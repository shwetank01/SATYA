'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api } from '@/lib/console/client';
import { inr } from '@/lib/console/format';
import { CHANNELS } from '@/lib/console/pay';
import { acct } from '@/lib/satya/normalize';

interface Vendor { id: string; vendor_name: string; acct_hash: string; acct_hint: string }
interface Approver { id: string; name: string; role: string; callback_phone: string; max_amount_inr: number }
interface Rules { threshold_inr: number; allowed_channels: string[]; vendors: Vendor[]; approvers: Approver[]; updated_at: string | null; updated_by: string | null }

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** I6 Pay Rules: vendor accounts are hashed in this browser; only the last 4 digits are kept as a hint. */
export default function PayRules() {
  const [r, setR] = useState<Rules | null>(null);
  const [dirty, setDirty] = useState(false);
  const [v, setV] = useState({ name: '', account: '', ifsc: '' });
  const [a, setA] = useState({ name: '', role: '', phone: '', max: '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { api<Rules>('/pay/rules').then(setR).catch((e) => setMsg(e.message)); }, []);
  const edit = (next: Rules) => { setR(next); setDirty(true); setMsg(''); };

  async function save() {
    if (!r) return;
    try {
      const { updated_at: _u, updated_by: _b, ...body } = r;
      setR(await api<Rules>('/pay/rules', { method: 'PUT', body: JSON.stringify(body) }));
      setDirty(false); setMsg('Saved. Every new Pay Check uses these rules.');
    } catch (e) { setMsg(`Couldn’t save (${(e as Error).message}).`); }
  }

  if (!r) return <Shell kind="company" title="Pay Rules"><div className="card p-8 text-muted">{msg || 'Loading…'}</div></Shell>;
  const digits = v.account.replace(/\D/g, '');
  return (
    <Shell kind="company" title="Pay Rules" sub="Who may ask for money, how, up to how much, and which accounts are your real vendors. A request that breaks any of these is held for a callback."
      actions={<button className="btn-ink" disabled={!dirty} onClick={save}>{dirty ? 'Save rules' : 'Saved'}</button>}>
      {msg && <p role="status" className="mb-4 text-sm font-semibold">{msg}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="font-display text-lg font-semibold">Limits and channels</div>
          <div>
            <label htmlFor="thr" className="micro">Callback required above (₹)</label>
            <input id="thr" className="field mt-1.5" type="number" min={0} value={r.threshold_inr} onChange={(e) => edit({ ...r, threshold_inr: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            <div className="mt-1 text-xs text-muted">{inr(r.threshold_inr)}</div>
          </div>
          <div className="micro">Payment requests accepted by</div>
          <div className="flex flex-wrap gap-2">{CHANNELS.map(([val, l]) => {
            const on = r.allowed_channels.includes(val);
            return <button key={val} aria-pressed={on} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`} onClick={() => edit({ ...r, allowed_channels: on ? r.allowed_channels.filter((x) => x !== val) : [...r.allowed_channels, val] })}>{l}</button>;
          })}</div>
          <p className="text-xs text-muted">Anything else (WhatsApp, a call, a voice note) is held, however senior the voice sounds.</p>
          {r.updated_at && <p className="text-xs text-muted">Last saved by {r.updated_by}, {new Date(r.updated_at).toLocaleString('en-IN')}.</p>}
        </div>

        <div className="card space-y-3 p-6">
          <div className="font-display text-lg font-semibold">Vendors</div>
          {r.vendors.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-sm">
              <b>{x.vendor_name}</b>
              <span className="flex items-center gap-3"><span>a/c ••••{x.acct_hint}</span><button className="text-xs font-semibold text-blue underline" onClick={() => edit({ ...r, vendors: r.vendors.filter((y) => y.id !== x.id) })}>Remove</button></span>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-3">
            <input className="field" aria-label="Vendor name" placeholder="Vendor name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            <input className="field" aria-label="Account number" placeholder="Account number" inputMode="numeric" value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} />
            <input className="field" aria-label="IFSC" placeholder="IFSC" value={v.ifsc} onChange={(e) => setV({ ...v, ifsc: e.target.value.toUpperCase().trim() })} />
          </div>
          <button className="btn-ghost" disabled={!v.name.trim() || digits.length < 9 || digits.length > 18 || !IFSC.test(v.ifsc)} onClick={() => {
            edit({ ...r, vendors: [...r.vendors, { id: crypto.randomUUID(), vendor_name: v.name.trim(), acct_hash: acct(digits, v.ifsc).h, acct_hint: digits.slice(-4) }] });
            setV({ name: '', account: '', ifsc: '' });
          }}>Add vendor</button>
          <p className="text-xs text-muted">The account number is turned into a fingerprint here; SATYA stores the fingerprint and the last 4 digits only.</p>
        </div>

        <div className="card space-y-3 p-6 lg:col-span-2">
          <div className="font-display text-lg font-semibold">Approvers</div>
          {r.approvers.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
              <b>{x.name} · {x.role}</b>
              <span className="flex items-center gap-3"><span>callback {x.callback_phone} · up to {inr(x.max_amount_inr)}</span><button className="text-xs font-semibold text-blue underline" onClick={() => edit({ ...r, approvers: r.approvers.filter((y) => y.id !== x.id) })}>Remove</button></span>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-4">
            <input className="field" aria-label="Name" placeholder="Name, as people sign" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
            <input className="field" aria-label="Role" placeholder="Role" value={a.role} onChange={(e) => setA({ ...a, role: e.target.value })} />
            <input className="field" aria-label="Callback phone" placeholder="Callback phone" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
            <input className="field" aria-label="Maximum amount" placeholder="Max amount ₹" type="number" min={0} value={a.max} onChange={(e) => setA({ ...a, max: e.target.value })} />
          </div>
          <button className="btn-ghost" disabled={!a.name.trim() || !/^[+\d][\d ()-]{6,20}$/.test(a.phone.trim()) || !a.max} onClick={() => {
            edit({ ...r, approvers: [...r.approvers, { id: crypto.randomUUID(), name: a.name.trim(), role: a.role.trim(), callback_phone: a.phone.trim(), max_amount_inr: Math.round(Number(a.max)) }] });
            setA({ name: '', role: '', phone: '', max: '' });
          }}>Add approver</button>
        </div>
      </div>
    </Shell>
  );
}
