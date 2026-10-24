'use client';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/ui';
import { api, getKeys } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';
import { certMessage, signHex, verifyHex } from '@/lib/satya/crypto';

const LISTS: [string, string][] = [
  ['web_domains', 'Web domains (.bank.in)'], ['extra_allowed_link_hosts', 'Other link hosts you use (short links)'],
  ['email_domains', 'Email domains'], ['sms_headers', 'SMS sender headers'], ['service_1600', 'Service numbers (1600xx)'],
  ['promo_140', 'Promotional numbers (140xx)'], ['inbound_helplines', 'Helplines customers call'],
];

/** I1 Promise Card Builder: edit, sign in this browser with the bank's Sign key, publish. */
export default function CardBuilder() {
  const s = useSession();
  const [card, setCard] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [lists, setLists] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    api('/cards').then(async (r) => {
      const c = JSON.parse(r.card_json);
      setCard(c); setMeta(r);
      setLists(Object.fromEntries(LISTS.map(([k]) => [k, (c[k] ?? []).join('\n')])));
      const signer = r.signed_by === 'satya_root' ? r.root_pk : r.sign_pk;
      setValid(signer ? await verifyHex(r.card_json, r.sig, signer) : null);
    }).catch((e) => setStatus(e.message));
  }, []);

  async function publish() {
    const k = await getKeys(s.org);
    if (!k?.sign) { setStatus('Import your keys on the Keys page first.'); return; }
    if (k.sign.pk !== meta.sign_pk) { setStatus('These keys are not the ones in your SATYA certificate.'); return; }
    const next = { ...card, issued_at: new Date().toISOString() };
    for (const [key] of LISTS) next[key] = lists[key].split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    const cardJson = JSON.stringify(next);
    const sig = await signHex(cardJson, k.sign.sk);
    const ok = await verifyHex(cardJson, sig, k.sign.pk);
    if (!ok) { setStatus('Local signature check failed.'); return; }
    setStatus('Publishing…');
    const r = await api<{ version: number }>('/cards', { method: 'POST', body: JSON.stringify({ bank_id: s.org, card_json: cardJson, sig }) });
    setCard(next); setMeta({ ...meta, card_json: cardJson, sig, signed_by: 'bank', version: r.version }); setValid(true);
    setStatus(`Published version ${r.version}. Signature valid. Phones pick it up at their next sync.`);
  }

  return (
    <Shell title="Promise Card" sub="What your bank promises it will never ask customers to do, and the official channels it uses. Signed in this browser with your Sign key; phones verify it against SATYA’s certificate.">
      {!card ? <div className="card p-8 text-muted">{status || 'Loading your card…'}</div> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="stamp">{valid == null ? 'Unchecked' : valid ? 'Signature valid' : 'Signature invalid'}</span>
              <span className="text-sm text-muted">Version {meta.version} · signed by {meta.signed_by === 'bank' ? s.orgName : 'SATYA Root'}</span>
            </div>
            {LISTS.map(([k, label]) => (
              <div key={k}>
                <label className="micro">{label}</label>
                <textarea className="field mt-1.5 font-mono text-sm" rows={Math.max(2, (lists[k] ?? '').split('\n').length)} value={lists[k] ?? ''} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} />
              </div>
            ))}
            <button className="btn-ink w-full" onClick={publish}>Sign &amp; Publish</button>
            {status && <p className="text-sm font-semibold">{status}</p>}
          </div>
          <div className="card p-6">
            <div className="micro">Never-ask list ({card.promises.length + 0} bank promises + SATYA Global)</div>
            <div className="mt-3 space-y-3">
              {card.promises.map((p: any) => (
                <div key={p.id} className="rounded-2xl border border-ink/10 p-4">
                  <div className="flex items-center gap-2"><span className="stamp">{p.if_broken}</span><span className="text-xs font-bold text-muted">{p.id}</span></div>
                  <p className="mt-2 italic">“{p.promise}”</p>
                  {p.source && <a className="mt-1 inline-block text-xs font-semibold text-blue" href={p.source} target="_blank" rel="noreferrer">Source</a>}
                </div>
              ))}
              {!card.promises.length && <p className="text-sm text-muted">No bank-specific promises yet; SATYA Global promises (OTP, links, remote access, safe accounts, KYC fees) always apply.</p>}
            </div>
            <p className="mt-4 text-xs text-muted">Certificate: <code>{certMessage(s.org, meta.sign_pk ?? '', meta.box_pk ?? '').slice(0, 60)}…</code></p>
          </div>
        </div>
      )}
    </Shell>
  );
}
