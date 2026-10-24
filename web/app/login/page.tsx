'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Seal } from '@/components/ui';
import { supabase } from '@/lib/console/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="grain lattice grid min-h-screen place-items-center bg-blue px-4" style={{ backgroundBlendMode: 'soft-light' }}>
      <form
        className="card-in w-full max-w-sm rounded-[28px] bg-paper p-7 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError('');
          const { error } = await supabase().auth.signInWithPassword({ email, password });
          setBusy(false);
          if (error) setError('Email or password is wrong.'); else router.replace('/');
        }}
      >
        <div className="flex items-center gap-3"><Seal size={44} /><div><div className="font-display text-xl font-semibold tracking-[.1em] text-blue">NYAYA</div><div className="micro">SATYA console</div></div></div>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-blue">Sign in</h1>
        <p className="mt-1 text-sm text-body2">For bank fraud desks and company finance teams. SATYA’s phone users never have accounts.</p>
        <label className="mt-6 block micro">Work email</label>
        <input className="field mt-1.5" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="mt-4 block micro">Password</label>
        <input className="field mt-1.5" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="mt-3 text-sm font-semibold text-ink">{error}</p>}
        <button className="btn-ink mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
