// Accuracy and latency of the Sarvam /ai/analyze prompt on VIVEK's labelled cases (vivek/eval/ask_cases.json).
// Usage: npx tsx --env-file=.env.local scripts/eval-sarvam.ts
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../lib/ai/analyze';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'vivek', 'eval', 'ask_cases.json'), 'utf8'));

for (const set of ['cases', 'holdout'] as const) {
  let ok = 0; let bank = 0; const ms: number[] = [];
  for (const c of data[set] as { text: string; ask_type: string; bank: string }[]) {
    const t = Date.now();
    const a = await analyze(c.text);
    ms.push(Date.now() - t);
    const hit = a.ask_type === c.ask_type;
    ok += hit ? 1 : 0;
    bank += a.claimed_bank === c.bank ? 1 : 0;
    if (!hit) console.log(`  MISS ${a.ask_type} (want ${c.ask_type}) risk=${a.risk} :: ${c.text.slice(0, 70)}`);
  }
  ms.sort((a, b) => a - b);
  console.log(`${set}: ask ${ok}/${ms.length}, bank ${bank}/${ms.length}, median ${ms[Math.floor(ms.length / 2)]} ms`);
}
