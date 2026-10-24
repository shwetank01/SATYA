'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Seal } from '@/components/ui';
import { api } from '@/lib/console/client';

const BANKS = [['SBI', 'State Bank of India'], ['HDFC', 'HDFC Bank'], ['ICICI', 'ICICI Bank'], ['AXIS', 'Axis Bank'], ['PNB', 'Punjab National Bank']] as const;

export default function Login() {
  const router = useRouter();
  const [bank, setBank] = useState<string>('SBI');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="grain lattice grid min-h-screen place-items-center bg-blue px-4" style={{ backgroundBlendMode: 'soft-light' }}>
      <form
        className="card-in w-full max-w-sm rounded-[28px] bg-paper p-7 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError('');
          try {
            await api('/console/login', { method: 'POST', body: JSON.stringify({ bank, password }) });
            router.replace('/inbox');
          } catch (err) {
            setError((err as Error).message === 'wrong_password' ? 'That password is wrong.' : 'Sign-in is unavailable right now.');
          } finally { setBusy(false); }
        }}
      >
        <div className="flex items-center gap-3"><Seal size={44} /><div><div className="font-display text-xl font-semibold tracking-[.1em] text-blue">NYAYA</div><div className="micro">SATYA for banks</div></div></div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-blue">Sign in</h1>
        <p className="mt-1 text-sm text-body2">For bank fraud desks. SATYA’s phone users never have accounts.</p>
        <label htmlFor="bank" className="mt-6 block micro">Bank</label>
        <select id="bank" className="field mt-1.5" value={bank} onChange={(e) => setBank(e.target.value)}>
          {BANKS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <label htmlFor="pw" className="mt-4 block micro">Console password</label>
        <input id="pw" className="field mt-1.5" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-ink">{error}</p>}
        <button className="btn-ink mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
