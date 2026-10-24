'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SEAL } from './sealPaths';
import { api } from '@/lib/console/client';
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

/** The three things a bank's fraud desk does in NYAYA. */
const NAV = [
  ['/inbox', 'Report Inbox', 'Sealed reports from customers'],
  ['/check', 'Scam Check', 'Rules + Sarvam AI on any message'],
  ['/blocklist', 'Blocklist', 'Block a scammer for every phone'],
] as const;

export function Shell({ title, sub, children, actions }: { title: string; sub?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const s = useSession();
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => path === href || path?.startsWith(href + '/') || (href === '/inbox' && path?.startsWith('/case'));
  return (
    <div className="flex min-h-screen">
      <aside className="grain lattice sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 bg-blue p-5 text-paper md:flex" style={{ backgroundBlendMode: 'soft-light' }}>
        <div className="flex items-center gap-2.5"><Seal size={36} /><span className="font-display text-lg font-semibold tracking-[.1em] text-yellow">NYAYA</span></div>
        <div className="rounded-2xl border border-white/30 bg-white/10 p-3">
          <div className="micro !text-paper/80">Bank fraud desk</div>
          <div className="mt-1 font-semibold">{s.orgName}</div>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Console">
          {NAV.map(([href, label, hint]) => (
            <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={`rounded-xl px-3 py-2.5 transition ${active(href) ? 'bg-yellow text-ink' : 'hover:bg-white/10'}`}>
              <div className="text-[15px] font-semibold">{label}</div>
              <div className={`text-xs ${active(href) ? 'text-ink/70' : 'text-paper/70'}`}>{hint}</div>
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-xs text-paper/70">
          <div>AI by Sarvam (sarvam-105b, Saaras). Rules decide; AI explains.</div>
          <button className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-paper hover:bg-white/10" onClick={async () => { await api('/console/logout', { method: 'POST' }).catch(() => {}); router.replace('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-blue md:text-4xl">{title}</h1>
            {sub && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-body2">{sub}</p>}
          </div>
          {actions}
        </div>
        <nav className="mb-4 flex gap-2 overflow-x-auto md:hidden" aria-label="Console">
          {NAV.map(([href, label]) => <Link key={href} href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${active(href) ? 'border-blue bg-blue text-paper' : 'border-ink/15 bg-white'}`}>{label}</Link>)}
        </nav>
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

const VERDICT: Record<string, string> = { breaks: 'Breaks promise', suspicious: 'Looks like a scam', no_broken_promise: 'No broken promise' };
export const verdictWord = (v: string) => VERDICT[v] ?? v;
