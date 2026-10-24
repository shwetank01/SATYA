'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SEAL } from './sealPaths';
import { supabase } from '@/lib/console/client';
import { useSession } from '@/lib/console/session';

export function Seal({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} aria-hidden>
      <defs><clipPath id="eye"><path d={SEAL.EYE} /></clipPath></defs>
      <path d={SEAL.DISC} fill="#F7C800" />
      <path d={SEAL.TICKS} stroke="#1F5FC4" strokeWidth={3} strokeLinecap="round" />
      <circle cx={120} cy={120} r={91} fill="none" stroke="#1F5FC4" strokeWidth={4} />
      <g clipPath="url(#eye)"><circle cx={120} cy={120} r={30} fill="none" stroke="#1F5FC4" strokeWidth={8} /><path d={SEAL.KEYHOLE} fill="#1F5FC4" /></g>
      <path d={SEAL.EYE} fill="none" stroke="#1F5FC4" strokeWidth={8} strokeLinejoin="round" />
      <circle cx={120} cy={52} r={4.5} fill="#1F5FC4" /><circle cx={120} cy={188} r={4.5} fill="#1F5FC4" />
    </svg>
  );
}

const BANK_NAV = [
  ['/radar', 'Impersonation Radar'], ['/recheck', 'Deepfake Re-check'], ['/card', 'Promise Card'], ['/blocklist', 'Blocklist'], ['/keys', 'Keys'],
];
const COMPANY_NAV = [['/pay/check', 'Pay Check'], ['/pay/history', 'History'], ['/pay/rules', 'Pay Rules']];

export function Shell({ title, sub, children, actions }: { title: string; sub?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const s = useSession();
  const path = usePathname();
  const router = useRouter();
  const nav = s.orgType === 'bank' ? BANK_NAV : COMPANY_NAV;
  return (
    <div className="flex min-h-screen">
      <aside className="grain lattice sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 bg-blue p-5 text-paper md:flex" style={{ backgroundBlendMode: 'soft-light' }}>
        <div className="flex items-center gap-2.5"><Seal size={36} /><span className="font-display text-lg font-semibold tracking-[.1em] text-yellow">NYAYA</span></div>
        <div className="rounded-2xl border border-white/30 bg-white/10 p-3">
          <div className="micro !text-paper/80">{s.orgType === 'bank' ? 'Bank' : 'Company'}</div>
          <div className="mt-1 font-semibold">{s.orgName}</div>
          <div className="text-xs text-sub">{s.email}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={`rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${path?.startsWith(href) ? 'bg-yellow text-ink' : 'hover:bg-white/10'}`}>{label}</Link>
          ))}
        </nav>
        <button className="mt-auto rounded-xl px-3 py-2 text-left text-sm font-semibold text-sub hover:bg-white/10" onClick={async () => { await supabase().auth.signOut(); router.replace('/login'); }}>Sign out</button>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-blue md:text-4xl">{title}</h1>
            {sub && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-body2">{sub}</p>}
          </div>
          {actions}
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
          {nav.map(([href, label]) => <Link key={href} href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${path?.startsWith(href) ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{label}</Link>)}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Sev({ s }: { s: string }) {
  return <span className="stamp">{s}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card px-6 py-10 text-center text-[15px] text-muted">{children}</div>;
}

export const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};
