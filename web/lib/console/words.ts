// Plain words for each action in the audit trail (lib/store.ts logAction). One table, so a new
// feature adds its words here and the Audit page and exports stay consistent.
const WORDS: Record<string, string> = {
  signed_in: 'Signed in',
  report_opened: 'Opened a sealed report',
  report_dismissed: 'Dismissed a report',
  ai_brief: 'Asked for an AI case brief',
  blocked_for_everyone: 'Blocked for every SATYA phone',
  exported_case_register: 'Downloaded the case register',
};

export const actionWord = (a: string) => WORDS[a] ?? a.replace(/_/g, ' ');
