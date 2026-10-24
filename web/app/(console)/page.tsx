'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** A fraud desk starts at its Report Inbox. */
export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace('/inbox'); }, [router]);
  return null;
}
