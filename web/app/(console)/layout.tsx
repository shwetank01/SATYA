'use client';
import { SessionGate } from '@/lib/console/session';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
