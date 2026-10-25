// Values used by the demo data (scripts/demo-data.ts) and by the console's "sample" buttons, in one
// place so a stage demo always matches what was seeded. None of these are real accounts.

/** Scam receiving accounts the demo seeds as confirmed fake by another bank, keyed by home bank. */
export const DEMO_MULES: Record<string, { upi?: string; acct?: [string, string]; by: string }[]> = {
  SBI: [{ upi: 'rahul.kyc99@oksbi', by: 'HDFC' }, { upi: 'sbi.reward.desk@sbi', by: 'ICICI' }],
  HDFC: [{ upi: 'refund.desk@okhdfcbank', by: 'SBI' }, { acct: ['50100123456780', 'HDFC0001234'], by: 'AXIS' }],
  ICICI: [{ upi: 'yono.cashback@ibl', by: 'SBI' }],
  AXIS: [{ upi: 'kycupdate.pnb@okaxis', by: 'PNB' }],
  PNB: [{ upi: 'pnbone.kyc@pnb', by: 'AXIS' }],
};

/** A bank's "own accounts" list for the Mule Watch private match: decoys plus its demo mules. */
export function sampleAccounts(bank: string): string[] {
  const own = (DEMO_MULES[bank] ?? []).map((m) => (m.upi ? m.upi : `${m.acct![0]}, ${m.acct![1]}`));
  const handle = { SBI: 'oksbi', HDFC: 'okhdfcbank', ICICI: 'okicici', AXIS: 'okaxis', PNB: 'pnb' }[bank] ?? 'upi';
  const decoys = ['priya.sharma', 'anand.textiles', 'meera.iyer88', 'kirana.store.12', 'v.menon'].map((n) => `${n}@${handle}`);
  return [...decoys.slice(0, 3), ...own, ...decoys.slice(3)];
}
