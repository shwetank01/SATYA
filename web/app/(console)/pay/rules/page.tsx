'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { supabase } from '@/lib/console/client';
import { CHANNELS, inr, loadRules } from '@/lib/console/pay';
import { useSession } from '@/lib/console/session';
import { acct } from '@/lib/satya/normalize';

/** I6 Pay Rules: vendor accounts are hashed in this browser; only the last 4 digits are stored as a hint. */
export default function Rules() {
  const s = useSession();
  const [r, setR] = useState<Awaited<ReturnType<typeof loadRules>> | null>(null);
  const [v, setV] = useState({ name: '', account: '', ifsc: '' });
  const [a, setA] = useState({ name: '', role: '', phone: '', max: '' });
  const [msg, setMsg] = useState('');
  const reload = () => loadRules(s.org).then(setR);
  useEffect(() => { reload(); }, [s.org]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRules(threshold: number, channels: string[]) {
    const { error } = await supabase().from('pay_rules').upsert({ org_id: s.org, threshold_inr: threshold, allowed_channels: channels, updated_at: new Date().toISOString() });
    setMsg(error ? error.message : 'Saved.'); reload();
  }
  if (!r) return <Shell title="Pay Rules"><div className="card p-8 text-muted">Loading…</div></Shell>;
  return (
    <Shell title="Pay Rules" sub="Vendors, approvers, channels and the amount above which a callback is required.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="font-display text-lg font-semibold">Limits and channels</div>
          <div><label className="micro">Callback above</label><input className="field mt-1.5" type="number" defaultValue={r.threshold_inr} onBlur={(e) => saveRules(Number(e.target.value), r.allowed_channels)} /></div>
          <div className="micro">Payment requests accepted by</div>
          <div className="flex flex-wrap gap-2">{CHANNELS.map(([val, l]) => {
            const on = r.allowed_channels.includes(val);
            return <button key={val} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`} onClick={() => saveRules(r.threshold_inr, on ? r.allowed_channels.filter((x) => x !== val) : [...r.allowed_channels, val])}>{l}</button>;
          })}</div>
          {msg && <p className="text-sm font-semibold">{msg}</p>}
        </div>
        <div className="card space-y-3 p-6">
          <div className="font-display text-lg font-semibold">Vendors</div>
          {r.vendorRows.map((x) => <div key={x.id} className="flex justify-between rounded-xl bg-paper px-3 py-2 text-sm"><b>{x.vendor_name}</b><span>a/c ••••{x.acct_hint}</span></div>)}
          <div className="grid gap-2 md:grid-cols-3">
            <input className="field" placeholder="Vendor name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            <input className="field" placeholder="Account number" value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} />
            <input className="field" placeholder="IFSC" value={v.ifsc} onChange={(e) => setV({ ...v, ifsc: e.target.value.toUpperCase() })} />
          </div>
          <button className="btn-ink" disabled={!v.name || v.account.replace(/\D/g, '').length < 9 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.ifsc)} onClick={async () => {
            const { error } = await supabase().from('pay_vendors').insert({ org_id: s.org, vendor_name: v.name, acct_hash: acct(v.account, v.ifsc).h, acct_hint: v.account.replace(/\D/g, '').slice(-4) });
            setMsg(error ? error.message : 'Vendor added (account stored as a hash).'); setV({ name: '', account: '', ifsc: '' }); reload();
          }}>Add vendor</button>
        </div>
        <div className="card space-y-3 p-6 lg:col-span-2">
          <div className="font-display text-lg font-semibold">Approvers</div>
          {r.approverRows.map((x) => <div key={x.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-sm"><b>{x.name} · {x.role}</b><span>call {x.callback_phone} · up to {inr(x.max_amount_inr)}</span></div>)}
          <div className="grid gap-2 md:grid-cols-4">
            <input className="field" placeholder="Name" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
            <input className="field" placeholder="Role" value={a.role} onChange={(e) => setA({ ...a, role: e.target.value })} />
            <input className="field" placeholder="Callback phone" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
            <input className="field" placeholder="Max amount ₹" type="number" value={a.max} onChange={(e) => setA({ ...a, max: e.target.value })} />
          </div>
          <button className="btn-ink" disabled={!a.name || !a.phone || !a.max} onClick={async () => {
            const { error } = await supabase().from('pay_approvers').insert({ org_id: s.org, name: a.name, role: a.role, callback_phone: a.phone, max_amount_inr: Number(a.max) });
            setMsg(error ? error.message : 'Approver added.'); setA({ name: '', role: '', phone: '', max: '' }); reload();
          }}>Add approver</button>
        </div>
      </div>
    </Shell>
  );
}
