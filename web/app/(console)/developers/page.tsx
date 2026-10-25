'use client';
import { useCallback, useEffect, useState } from 'react';
import { Columns } from '@/components/charts';
import { Shell, ago, verdictWord } from '@/components/ui';
import { api } from '@/lib/console/client';
import { count, shortDay } from '@/lib/console/format';
import { useSession } from '@/lib/console/session';

interface Key { id: string; prefix: string; created_at: string; created_by: string; revoked_at: string | null; revoked_by: string | null }
interface Data { keys: Key[]; usage: { day: string; n: number }[]; daily_cap: number }

const SAMPLE = 'Sir HDFC fraud team here. To stop the debit, tell me the OTP you just received. Do not tell anyone.';

/** The Scam Check API: SATYA's check inside a bank's own app, IVR, chatbot and contact-centre tools. */
export default function Developers() {
  const s = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [tryKey, setTryKey] = useState('');
  const [tryText, setTryText] = useState(SAMPLE);
  const [out, setOut] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('https://satya-gateway.vercel.app');
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(() => { api<Data>('/console/apikeys').then(setD).catch((e) => setMsg(e.message)); }, []);
  useEffect(load, [load]);

  async function create() {
    try { const r = await api<{ key: string }>('/console/apikeys', { method: 'POST' }); setFresh(r.key); setTryKey(r.key); load(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function revoke(id: string) {
    try { await api('/console/apikeys', { method: 'DELETE', body: JSON.stringify({ id }) }); load(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function tryIt() {
    setBusy(true); setOut('');
    const t = Date.now();
    const r = await fetch('/api/v1/partner/check', { method: 'POST', headers: { authorization: `Bearer ${tryKey.trim()}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: tryText, channel: 'whatsapp', sender: '+91 98765 43210' }) });
    const j = await r.json().catch(() => ({}));
    setOut(`HTTP ${r.status} · ${Date.now() - t} ms · ${r.headers.get('x-ratelimit-remaining') ?? '?'} calls left today\n\n` + JSON.stringify(j, null, 2));
    setBusy(false); load();
  }

  const curl = `curl -X POST ${origin}/api/v1/partner/check \\\n  -H "Authorization: Bearer nyaya_live_${s.org.toLowerCase()}_…" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Your KYC is pending, pay Rs 10 at sbi-kyc.in","channel":"sms","sender":"VM-KYCUPD"}'`;
  const today = d?.usage.at(-1)?.n ?? 0;
  const month = d?.usage.reduce((n, u) => n + u.n, 0) ?? 0;

  return (
    <Shell kind="bank" title="API access" sub={`Put SATYA’s Scam Check inside ${s.orgName}’s own channels: the mobile banking app, IVR, WhatsApp bot and contact-centre screens. Same signed promise rules and Sarvam AI as this console; nothing in a request is stored.`}>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-display text-lg font-semibold">Keys</div>
              <button className="btn-ink" onClick={create}>Create key</button>
            </div>
            {fresh && (
              <div className="mt-3 rounded-2xl bg-paper p-3">
                <div className="micro">New key, shown once</div>
                <code className="mt-1 block break-all text-sm font-semibold">{fresh}</code>
                <button className="mt-2 text-xs font-semibold text-blue underline" onClick={() => navigator.clipboard?.writeText(fresh)}>Copy</button>
                <p className="mt-1 text-xs text-muted">SATYA keeps only its SHA-256. Store it in your secrets manager, never in an app build.</p>
              </div>
            )}
            <div className="mt-3 divide-y divide-ink/5">
              {(d?.keys ?? []).map((k) => (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><code className="font-semibold">{k.prefix}…</code><span className="block text-xs text-muted">created by {k.created_by}, {ago(k.created_at)}{k.revoked_at ? ` · revoked by ${k.revoked_by}` : ''}</span></span>
                  {k.revoked_at ? <span className="stamp">Revoked</span> : <button className="btn-ghost !h-9" onClick={() => revoke(k.id)}>Revoke</button>}
                </div>
              ))}
              {d && !d.keys.length && <p className="py-2 text-sm text-muted">No keys yet.</p>}
            </div>
            {msg && <p className="mt-2 text-sm font-semibold">{msg}</p>}
          </div>
          <div className="card p-5">
            <div className="font-display text-lg font-semibold">Calls per day</div>
            <div className="text-sm text-muted">{count(today)} today of {count(d?.daily_cap ?? 0)} allowed · {count(month)} in 30 days</div>
            {d && <div className="mt-2"><Columns label="Calls" data={d.usage.slice(-14).map((u) => ({ key: u.day, n: u.n, label: shortDay(u.day) }))} /></div>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="font-display text-lg font-semibold">One call</div>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink p-4 text-xs leading-relaxed text-paper">{curl}</pre>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-body2">
              <li><b>verdict</b>: <code>breaks</code> (a written promise is broken, decided by rules), <code>suspicious</code> (no rule, AI at least 75% sure it is a scam) or <code>no_broken_promise</code>.</li>
              <li><b>broken_promises</b>: each with the official source, in English and Hindi, for your app to show.</li>
              <li><b>ai.advice</b> / <b>advice_hi</b>: what to tell the customer, ready for an agent to read out.</li>
              <li>Send <code>"ai": false</code> for rules only (a few milliseconds, no AI cost).</li>
            </ul>
          </div>
          <div className="card p-5">
            <div className="font-display text-lg font-semibold">Try it</div>
            <input className="field mt-3 font-mono text-sm" aria-label="API key" placeholder="nyaya_live_…" value={tryKey} onChange={(e) => setTryKey(e.target.value)} />
            <textarea className="field mt-2 !h-20 text-sm" aria-label="Message" value={tryText} onChange={(e) => setTryText(e.target.value)} />
            <button className="btn-ink mt-2" disabled={busy || !tryKey.trim() || !tryText.trim()} onClick={tryIt}>{busy ? 'Calling…' : 'Send'}</button>
            {out && <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-paper p-3 text-xs">{out}</pre>}
            {out.includes('"verdict"') && <p className="mt-2 text-sm">Verdict: <span className="stamp">{verdictWord(JSON.parse(out.slice(out.indexOf('{'))).verdict)}</span></p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
