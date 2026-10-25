'use client';
// Two small single-series charts for the console, drawn in brand blue (validated against the white
// card: lightness, chroma and 3:1 contrast pass). One series, so the card title names it and there
// is no legend; every value is also reachable without hover through the table view.
import { useState } from 'react';

const BLUE = '#1F5FC4';

function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const out: number[] = [];
  for (let v = 0; v <= max + step - 1 && out.length < 6; v += step) out.push(v);
  return out;
}

/** Columns over time: <=24px, 4px rounded cap, square at the baseline, hover/focus tooltip per column. */
export function Columns({ data, label, format = String }: { data: { key: string; n: number; label: string }[]; label: string; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.n));
  const tk = ticks(max);
  const top = tk[tk.length - 1] || 1;
  const peak = data.reduce((best, d, i) => (d.n > data[best].n ? i : best), 0);
  const H = 168;
  // Label every Nth day, counted back from today, so labels never wrap in a narrow card.
  const every = Math.max(1, Math.ceil(data.length / 6));
  return (
    <div>
      <div className="mb-5 flex justify-end"><button className="text-xs font-semibold text-blue underline" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show as table'}</button></div>
      {table ? (
        <table className="w-full text-sm"><thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Day</th><th className="py-1 text-right font-semibold">{label}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.key} className="border-t border-ink/5"><td className="py-1">{d.label}</td><td className="py-1 text-right tabular-nums">{format(d.n)}</td></tr>)}</tbody></table>
      ) : (
        <div className="flex gap-2">
          <div className="relative w-7 shrink-0 text-right text-[11px] text-muted" style={{ height: H }}>
            {tk.map((v) => <span key={v} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: H - (v / top) * H }}>{format(v)}</span>)}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="relative" style={{ height: H }}>
              {tk.map((v) => <div key={v} className="absolute inset-x-0 h-px bg-ink/[.07]" style={{ top: H - (v / top) * H }} />)}
              <div className="absolute inset-0 flex items-end">
                {data.map((d, i) => {
                  const h = (d.n / top) * H;
                  const labelled = i === peak || i === data.length - 1;
                  return (
                    <button key={d.key} type="button" aria-label={`${d.label}: ${format(d.n)} ${label.toLowerCase()}`}
                      className="group relative flex h-full flex-1 items-end justify-center outline-none"
                      onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                      {labelled && d.n > 0 && <span className="absolute text-[11px] font-semibold tabular-nums text-ink" style={{ bottom: h + 4 }}>{format(d.n)}</span>}
                      <span className="block w-full max-w-6 rounded-t-[4px] transition-opacity" style={{ height: Math.max(d.n ? 2 : 0, h), background: BLUE, opacity: hover === null || hover === i ? 1 : 0.55 }} />
                      {hover === i && (
                        <span role="tooltip" className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl bg-ink px-2.5 py-1.5 text-left text-paper shadow-lg" style={{ bottom: Math.min(H - 8, h + 22) }}>
                          <span className="block text-sm font-semibold tabular-nums">{format(d.n)}</span>
                          <span className="block text-[11px] text-paper/75">{d.label}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-1.5 flex text-[11px] text-muted">
              {data.map((d, i) => <span key={d.key} className="flex-1 whitespace-nowrap text-center">{(data.length - 1 - i) % every === 0 ? d.label : ''}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a breakdown, sorted by size, value at the tip. */
export function Bars({ data, format = String }: { data: { key: string; n: number; label: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.key} className="grid grid-cols-[minmax(88px,auto)_1fr] items-center gap-3 text-sm">
          <span className="truncate text-body2">{d.label}</span>
          <div className="flex items-center gap-2" title={`${d.label}: ${format(d.n)}`}>
            <span className="block h-3.5 rounded-r-[4px]" style={{ width: `${Math.max(2, (d.n / max) * 100)}%`, maxWidth: 'calc(100% - 3rem)', background: BLUE }} />
            <span className="font-semibold tabular-nums">{format(d.n)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
