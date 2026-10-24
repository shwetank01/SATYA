'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/console/session';

/** Org mode from orgs.type: banks land on the Radar, companies on Pay Check. */
export default function Home() {
  const s = useSession();
  const router = useRouter();
  useEffect(() => { router.replace(s.orgType === 'bank' ? '/radar' : '/pay/check'); }, [s, router]);
  return null;
}
