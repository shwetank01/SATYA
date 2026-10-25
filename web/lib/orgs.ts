// The institutions that sign in to NYAYA. Banks receive sealed reports (their certificates are in
// the Registry Bundle); companies use Pay Check. Plain data so the login page can import it without
// pulling the signed bundle into the browser; tests/orgs.test.ts keeps the bank list equal to it.

export type OrgKind = 'bank' | 'company';
export interface Org { id: string; name: string; kind: OrgKind }

export const BANK_ORGS: Org[] = [
  { id: 'SBI', name: 'State Bank of India', kind: 'bank' },
  { id: 'HDFC', name: 'HDFC Bank', kind: 'bank' },
  { id: 'ICICI', name: 'ICICI Bank', kind: 'bank' },
  { id: 'AXIS', name: 'Axis Bank', kind: 'bank' },
  { id: 'PNB', name: 'Punjab National Bank', kind: 'bank' },
];

export const COMPANY_ORGS: Org[] = [
  { id: 'ACME', name: 'Acme Industries', kind: 'company' },
];

export const ORGS: Record<string, Org> = Object.fromEntries([...BANK_ORGS, ...COMPANY_ORGS].map((o) => [o.id, o]));

/**
 * A person's name as typed at sign-in: letters in any script with their combining marks (Devanagari
 * vowel signs are marks, not letters), spaces and . ' - only.
 */
export const ANALYST = /^\p{L}[\p{L}\p{M} .'-]{1,39}$/u;
export const cleanAnalyst = (s: string) => s.replace(/\s+/g, ' ').trim();
