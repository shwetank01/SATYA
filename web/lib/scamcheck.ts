// One Scam Check for every caller: the NYAYA console page and the partner API (a bank's own app,
// IVR or contact centre). The promise rules decide "Breaks promise"; Sarvam can only add
// "Looks like a scam" when no rule fired, at the phone's 0.75 bar (Section 22.3).
import { analyze, type Analysis } from './ai/analyze';
import { CHAT_MODEL, sarvamConfigured } from './ai/sarvam';
import { PROMISES, RULE_BOOK } from './bundle';
import { effectiveRuleBook } from './registry';
import { evaluate, type ChannelWire } from './satya/rules';
import { storeConfigured } from './store';

const RANK = { none: 0, medium: 1, high: 2, critical: 3 } as const;

export interface ScamCheckResult {
  bank: string | null;
  hits: { id: string; severity: string; promise: string; promise_hi: string | null; issuer: string; source: string | null }[];
  verdict: 'breaks' | 'suspicious' | 'no_broken_promise';
  ai: Analysis | null;
}

export async function scamCheck(text: string, channel: ChannelWire, sender: string, opts: { ai?: boolean } = {}): Promise<ScamCheckResult> {
  // The cards phones receive, including any a bank published from NYAYA.
  const book = storeConfigured() ? await effectiveRuleBook().catch(() => RULE_BOOK) : RULE_BOOK;
  const r = evaluate(book, { text, channel, sender });
  const hits = r.hits
    .map(([id, severity]) => ({ id, severity, promise: PROMISES[id]?.promise ?? id, promise_hi: PROMISES[id]?.promise_hi ?? null, issuer: PROMISES[id]?.issuer ?? 'GLOBAL', source: PROMISES[id]?.source ?? null }))
    .sort((a, b) => RANK[b.severity as keyof typeof RANK] - RANK[a.severity as keyof typeof RANK]);
  const ai = opts.ai !== false && sarvamConfigured() ? await analyze(text, { bank: r.bank, channel, sender }, CHAT_MODEL) : null;
  const verdict = hits.length ? 'breaks' : ai?.source === 'ai' && ai.risk === 'scam' && ai.confidence >= 0.75 ? 'suspicious' : 'no_broken_promise';
  return { bank: r.bank, hits, verdict, ai };
}
