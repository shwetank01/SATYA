// Indian number formats for the console: lakh and crore, not million and billion.

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} crore`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export const count = (n: number) => n.toLocaleString('en-IN');

export function duration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'under 1 min';
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${Math.round(minutes / 1440)} days`;
}

export const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
