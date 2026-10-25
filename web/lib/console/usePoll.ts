'use client';
import { useEffect, useRef } from 'react';

/**
 * Runs `fn` now, then every `ms` while the tab is visible, and once more when it becomes visible
 * again. A console left open in a background tab costs no Blob reads.
 */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!t) t = setInterval(() => ref.current(), ms); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => { if (document.hidden) stop(); else { ref.current(); start(); } };
    ref.current();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ms]);
}
