'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './client';
import type { OrgKind } from '../orgs';

export interface Session { org: string; orgName: string; kind: OrgKind; user: string }
const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx)!;

/** Loads the signed-in analyst and institution from the session cookie or sends the browser to /login. */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => {
    api<Session>('/console/me').then(setS).catch(() => router.replace('/login'));
  }, [router]);
  if (!s) return <div className="grid min-h-screen place-items-center text-muted">Opening NYAYA…</div>;
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

/** Where each kind of institution lands after sign-in. */
export const homeOf = (kind: OrgKind) => (kind === 'bank' ? '/overview' : '/audit');
