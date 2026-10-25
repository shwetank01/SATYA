'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Seal } from '@/components/ui';
import { api } from '@/lib/console/client';
import { homeOf } from '@/lib/console/session';
import { BANK_ORGS, COMPANY_ORGS, type OrgKind } from '@/lib/orgs';

const KINDS: [OrgKind, string, string][] = [
  ['bank', 'Bank', 'Fraud desk'],
  ['company', 'Company', 'Finance team'],
];

export default function Login() {
  const router = useRouter();
  const [kind, setKind] = useState<OrgKind>('bank');
  const orgs = kind === 'bank' ? BANK_ORGS : COMPANY_ORGS;
  const [org, setOrg] = useState<string>(BANK_ORGS[0].id);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickKind = (k: OrgKind) => { setKind(k); setOrg((k === 'bank' ? BANK_ORGS : COMPANY_ORGS)[0]?.id ?? ''); };
  return (
    <div className="grain lattice grid min-h-screen place-items-center bg-blue px-4" style={{ backgroundBlendMode: 'soft-light' }}>
      <form
        className="card-in w-full max-w-sm rounded-[28px] bg-paper p-7 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError('');
          try {
            const r = await api<{ kind: OrgKind }>('/console/login', { method: 'POST', body: JSON.stringify({ org, user, password }) });
            router.replace(homeOf(r.kind));
          } catch (err) {
            const m = (err as Error).message;
            setError(m === 'wrong_password' ? 'That password is wrong.' : m === 'invalid_name' ? 'Type your name as it should appear in the audit trail.' : 'Sign-in is unavailable right now.');
          } finally { setBusy(false); }
        }}
      >
        <div className="flex items-center gap-3"><Seal size={44} /><div><div className="font-display text-xl font-semibold tracking-[.1em] text-blue">NYAYA</div><div className="micro">SATYA for institutions</div></div></div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-blue">Sign in</h1>
        <p className="mt-1 text-sm text-body2">For bank fraud desks and company finance teams. SATYA’s phone users never have accounts.</p>
        {COMPANY_ORGS.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2" role="tablist" aria-label="Institution type">
            {KINDS.map(([k, label, hint]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => pickKind(k)}
                className={`rounded-2xl border px-3 py-2 text-left ${kind === k ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>
                <div className="text-sm font-semibold">{label}</div><div className={`text-xs ${kind === k ? 'text-paper/75' : 'text-muted'}`}>{hint}</div>
              </button>
            ))}
          </div>
        )}
        <label htmlFor="org" className="mt-5 block micro">{kind === 'bank' ? 'Bank' : 'Company'}</label>
        <select id="org" className="field mt-1.5" value={org} onChange={(e) => setOrg(e.target.value)}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <label htmlFor="user" className="mt-4 block micro">Your name</label>
        <input id="user" className="field mt-1.5" autoComplete="name" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Recorded in the audit trail" required minLength={2} maxLength={40} />
        <label htmlFor="pw" className="mt-4 block micro">Console password</label>
        <input id="pw" className="field mt-1.5" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-ink">{error}</p>}
        <button className="btn-ink mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
