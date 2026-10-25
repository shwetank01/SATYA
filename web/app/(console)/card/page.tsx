'use client';
import { useEffect, useMemo, useState } from 'react';
import { Shell, verdictWord } from '@/components/ui';
import { api, getKeys, importKeys } from '@/lib/console/client';
import { ruleName } from '@/lib/console/ruleNames';
import { useSession } from '@/lib/console/session';
import { signHex, verifyHex } from '@/lib/satya/crypto';
import { evaluate, ruleBookFromCards, type ChannelWire } from '@/lib/satya/rules';

interface CardResponse {
  bank_id: string;
  card: { card_json: string; sig: string; signed_by: 'bank' | 'satya_root'; version: number };
  cert: { sign_pk: string; box_pk: string; cert_sig: string };
  root_pk: string | null;
  published: { at: string; by: string; version: number } | null;
  root_card_json: string;
  global_card_json: string;
  bank_cards: string[];
}

const LISTS: [string, string, string][] = [
  ['extra_allowed_link_hosts', 'Link hosts you send customers to', 'One per line, e.g. yonobusiness.sbi'],
  ['web_domains', 'Web domains (.bank.in)', 'sbi.bank.in'],
  ['sms_headers', 'SMS sender headers', 'SBIINB'],
  ['email_domains', 'Email domains', 'sbi.co.in'],
  ['service_1600', 'Service numbers (1600…)', '1600108333'],
  ['promo_140', 'Promotional numbers (140…)', '1409768333'],
  ['inbound_helplines', 'Helplines customers call', '18001234'],
];

/** A genuine-but-new SBI message the root card flags; the stage demo adds its host and publishes. */
const SAMPLE: Record<string, { text: string; sender: string; add: [string, string] }> = {
  SBI: { text: 'Dear Customer, your YONO Business cashback of Rs 500 is credited. View details at yonobusiness.sbi/offers - SBI', sender: 'VM-SBIINB', add: ['extra_allowed_link_hosts', 'yonobusiness.sbi'] },
};

const toLines = (v: unknown) => (Array.isArray(v) ? v.join('\n') : '');
const fromLines = (s: string, upper: boolean) => [...new Set(s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).map((x) => (upper ? x.toUpperCase() : x.toLowerCase())))];

function judge(globalJson: string, cards: string[], text: string, channel: ChannelWire, sender: string) {
  const book = ruleBookFromCards(JSON.parse(globalJson), cards.map((c) => JSON.parse(c)));
  const r = evaluate(book, { text, channel, sender });
  return { bank: r.bank, hits: r.hits, verdict: r.hits.length ? 'breaks' : 'no_broken_promise' };
}

/** I1 Promise Card Builder: edit the official channels, sign in this browser, publish to every phone. */
export default function CardBuilder() {
  const s = useSession();
  const [data, setData] = useState<CardResponse | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [lists, setLists] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const sample = SAMPLE[s.org];
  const [test, setTest] = useState({ text: sample?.text ?? '', sender: sample?.sender ?? '', channel: 'sms' as ChannelWire });

  async function load() {
    const r = await api<CardResponse>('/cards');
    setData(r);
    const card = JSON.parse(r.card.card_json);
    setLists(Object.fromEntries(LISTS.map(([k]) => [k, toLines(card[k])])));
    const signer = r.card.signed_by === 'satya_root' ? r.root_pk : r.cert.sign_pk;
    setValid(signer ? await verifyHex(r.card.card_json, r.card.sig, signer) : null);
  }
  useEffect(() => { load().catch((e) => setStatus(e.message)); getKeys(s.org).then((k) => setHasKey(Boolean(k?.sign))); }, [s.org]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => (data ? JSON.parse(data.card.card_json) : null), [data]);
  const draftJson = useMemo(() => {
    if (!current) return null;
    const next = { ...current };
    for (const [k] of LISTS) next[k] = fromLines(lists[k] ?? '', k === 'sms_headers');
    return next;
  }, [current, lists]);

  const diff = useMemo(() => {
    if (!current || !draftJson) return [];
    const out: string[] = [];
    for (const [k, label] of LISTS) {
      for (const x of draftJson[k]) if (!current[k].includes(x)) out.push(`Add ${x} to ${label.toLowerCase()}`);
      for (const x of current[k]) if (!draftJson[k].includes(x)) out.push(`Remove ${x} from ${label.toLowerCase()}`);
    }
    return out;
  }, [current, draftJson]);

  const preview = useMemo(() => {
    if (!data || !draftJson || !test.text.trim()) return null;
    const others = data.bank_cards.filter((c) => JSON.parse(c).bank_id !== s.org);
    return {
      before: judge(data.global_card_json, data.bank_cards, test.text, test.channel, test.sender),
      after: judge(data.global_card_json, [...others, JSON.stringify(draftJson)], test.text, test.channel, test.sender),
    };
  }, [data, draftJson, test, s.org]);

  async function publish() {
    if (!data || !draftJson) return;
    setBusy(true); setStatus('');
    try {
      const k = await getKeys(s.org);
      if (!k?.sign) throw new Error('Import your bank’s key file first.');
      if (k.sign.pk !== data.cert.sign_pk) throw new Error('This key file is not the one in your SATYA certificate.');
      const cardJson = JSON.stringify({ ...draftJson, issued_at: new Date().toISOString() });
      const sig = await signHex(cardJson, k.sign.sk);
      if (!(await verifyHex(cardJson, sig, data.cert.sign_pk))) throw new Error('The signature did not verify in this browser.');
      const r = await api<{ version: number }>('/cards', { method: 'POST', body: JSON.stringify({ card_json: cardJson, sig }) });
      await load();
      setStatus(`Published version ${r.version}, signed by ${s.orgName}. Scam Check uses it now; phones pick it up at their next sync (within 15 minutes, or when the app opens).`);
    } catch (e) { setStatus((e as Error).message); }
    setBusy(false);
  }

  async function reset() {
    setBusy(true);
    try { await api('/cards', { method: 'DELETE' }); await load(); setStatus('Back to the card SATYA signed with its root key.'); }
    catch (e) { setStatus((e as Error).message); }
    setBusy(false);
  }

  return (
    <Shell kind="bank" title="Promise Card" sub={`The official channels ${s.orgName} uses, which every SATYA phone checks messages against. Signed here with your bank’s Sign key; phones verify it against your SATYA certificate, so nobody else can change it.`}>
      {!data && <div className="card p-8 text-muted">{status || 'Loading your card…'}</div>}
      {data && current && (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="card space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="stamp">{valid === null ? 'Unchecked' : valid ? 'Signature valid' : 'Signature invalid'}</span>
              <span className="text-sm text-muted">Version {data.card.version} · signed by {data.card.signed_by === 'bank' ? s.orgName : 'SATYA root'}{data.published ? ` · published by ${data.published.by}, ${new Date(data.published.at).toLocaleString('en-IN')}` : ''}</span>
            </div>
            {LISTS.map(([k, label, ph]) => (
              <div key={k}>
                <label htmlFor={k} className="micro">{label}</label>
                <textarea id={k} className="field mt-1.5 font-mono text-sm" rows={Math.max(2, (lists[k] ?? '').split('\n').length)} placeholder={ph} value={lists[k] ?? ''} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} />
              </div>
            ))}
            {sample && !diff.length && !fromLines(lists[sample.add[0]] ?? '', false).includes(sample.add[1]) && (
              <button type="button" className="text-sm font-semibold text-blue underline" onClick={() => setLists({ ...lists, [sample.add[0]]: [lists[sample.add[0]], sample.add[1]].filter(Boolean).join('\n') })}>Add {sample.add[1]} (demo)</button>
            )}
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <div className="font-display text-lg font-semibold">Test a message against this card</div>
              <p className="mt-1 text-sm text-body2">The same rules the phone runs, here in your browser: before and after your change.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
                <select className="field" aria-label="Channel" value={test.channel} onChange={(e) => setTest({ ...test, channel: e.target.value as ChannelWire })}>
                  {['sms', 'whatsapp', 'email', 'call'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="field" aria-label="Sender" placeholder="Sender, e.g. VM-SBIINB" value={test.sender} onChange={(e) => setTest({ ...test, sender: e.target.value })} />
              </div>
              <textarea className="field mt-2 !h-24 text-sm" aria-label="Message" value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} placeholder="Paste a genuine message from your bank" />
              {preview && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(['before', 'after'] as const).map((w) => (
                    <div key={w} className="rounded-2xl bg-paper p-3">
                      <div className="micro">{w === 'before' ? 'Live card' : 'With your change'}</div>
                      <div className="mt-2"><span className="stamp">{verdictWord(preview[w].verdict)}</span></div>
                      <ul className="mt-2 space-y-1 text-xs text-body2">{preview[w].hits.map(([id, sev]) => <li key={id}><b className="uppercase">{sev}</b> · {ruleName(id)}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <div className="font-display text-lg font-semibold">Sign and publish</div>
              {diff.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{diff.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="mt-1 text-sm text-muted">No changes yet.</p>}
              {hasKey === false && (
                <label className="btn-ghost mt-3 w-full cursor-pointer">
                  Import your bank’s key file
                  <input type="file" accept="application/json" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const ok = await importKeys(await f.text(), s.org).catch(() => false);
                    setHasKey(ok); setStatus(ok ? 'Key imported into this browser.' : `That file has no keys for ${s.org}.`);
                  }} />
                </label>
              )}
              <button className="btn-ink mt-3 w-full" disabled={busy || !diff.length || !hasKey} onClick={publish}>{busy ? 'Working…' : 'Sign in this browser and publish'}</button>
              {data.card.signed_by === 'bank' && <button className="btn-ghost mt-2 w-full" disabled={busy} onClick={reset}>Go back to SATYA’s root-signed card</button>}
              {status && <p role="status" className="mt-3 text-sm font-semibold">{status}</p>}
              <p className="mt-3 text-xs text-muted">Your never-ask promises ({current.promises.length} for {s.org}, plus SATYA’s global ones) change only through SATYA’s registry review, with an official source for each.</p>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
