'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './client';

export interface Session { userId: string; email: string; org: string; orgName: string; orgType: 'bank' | 'company' }
const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx)!;

/** Loads the signed-in user's org (members + orgs, both RLS-protected) or sends them to /login. */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [s, setS] = useState<Session | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().auth.getUser();
      if (!data.user) { router.replace('/login'); return; }
      const m = await supabase().from('members').select('org_id').limit(1).maybeSingle();
      const orgId = (m.data as any)?.org_id;
      const o = orgId ? await supabase().from('orgs').select('id,name,type').eq('id', orgId).maybeSingle() : null;
      if (!alive) return;
      if (!o?.data) { router.replace('/login?e=no_org'); return; }
      setS({ userId: data.user.id, email: data.user.email ?? '', org: o.data.id, orgName: o.data.name, orgType: o.data.type });
    })();
    return () => { alive = false; };
  }, [router]);
  if (!s) return <div className="grid min-h-screen place-items-center text-muted">Opening NYAYA…</div>;
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}
