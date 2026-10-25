'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeOf, useSession } from '@/lib/console/session';

/** Each institution starts on its own home page. */
export default function Home() {
  const router = useRouter();
  const s = useSession();
  useEffect(() => { router.replace(homeOf(s.kind)); }, [router, s.kind]);
  return null;
}
