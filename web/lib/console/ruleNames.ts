// Short names for promise ids, for lists where the full promise text does not fit. The full text
// and its official source are on the case page (from the signed card).
const NAMES: Record<string, string> = {
  G01_NO_SECRETS: 'Asks for an OTP, PIN or password',
  G02_LINK_BANK_IN: 'Link not on the bank’s domain',
  G03_SERVICE_CALLS_1600: 'Calls from a personal mobile',
  G04_1600_IS_OUTBOUND_ONLY: 'Asks you to call a 1600 number',
  G05_SMS_FROM_HEADER_NOT_NUMBER: 'Bank SMS from a phone number',
  G06_NO_REMOTE_ACCESS: 'Asks to install a remote-access app',
  G07_NO_SAFE_ACCOUNT: 'Move money to a “safe account”',
  G08_NO_KYC_FEE: 'Asks for a KYC fee',
  SBI01_NO_KYC_LINKS: 'KYC link in the name of SBI',
  AXIS_EMAIL_SENDER_MISMATCH: 'Email not from an Axis domain',
  PNB01_TOLLFREE_NEVER_CALLS_OUT: 'PNB toll-free number calling out',
  PNB02_NO_LOGIN_DETAILS: 'Asks for PNB login details',
};

export const ruleName = (id: string) => NAMES[id] ?? id.replace(/_/g, ' ').toLowerCase();

/** Rules about the channel a message came from, rather than what it asks the customer to do. */
const CHANNEL_RULES = new Set(['G03_SERVICE_CALLS_1600', 'G05_SMS_FROM_HEADER_NOT_NUMBER', 'AXIS_EMAIL_SENDER_MISMATCH']);
export const isChannelRule = (id: string) => CHANNEL_RULES.has(id);

/** What the scam asks for comes first ("Asks for a KYC fee"), how it arrived second. */
export const askFirst = (ids: string[]) => [...ids].sort((a, b) => Number(isChannelRule(a)) - Number(isChannelRule(b)));
