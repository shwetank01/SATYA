// Which bank holds a scammer's account (Section 23.5, Mule Watch). A UPI ID's handle names the
// PSP bank behind it and an IFSC's first four letters name the bank, so a value confirmed fake by
// one bank can be routed to the bank where the receiving (mule) account actually lives.
// Only handles we are sure of are listed; anything else is "unknown", never guessed.

const UPI_HANDLES: Record<string, string> = {
  sbi: 'SBI', oksbi: 'SBI', ptsbi: 'SBI',
  hdfcbank: 'HDFC', okhdfcbank: 'HDFC', pthdfc: 'HDFC', payzapp: 'HDFC',
  icici: 'ICICI', okicici: 'ICICI', ibl: 'ICICI',
  axisbank: 'AXIS', okaxis: 'AXIS', axl: 'AXIS', ptaxis: 'AXIS', apl: 'AXIS',
  pnb: 'PNB',
};

/** Banks that are not SATYA console banks, named for display only. */
const OTHER_HANDLES: Record<string, string> = { ybl: 'Yes Bank', yespay: 'Yes Bank', ptyes: 'Yes Bank', kotak: 'Kotak Mahindra Bank', kmbl: 'Kotak Mahindra Bank', paytm: 'Paytm Payments Bank' };

const IFSC_BANKS: Record<string, string> = { SBIN: 'SBI', HDFC: 'HDFC', ICIC: 'ICICI', UTIB: 'AXIS', PUNB: 'PNB' };

export const upiHandle = (value: string) => (value.split('@')[1] ?? '').trim().toLowerCase();

/** Bank id for a UPI ID or a masked UPI label ("UPI sbi.k***@oksbi"), or null. */
export const bankOfUpi = (value: string): string | null => UPI_HANDLES[upiHandle(value)] ?? null;

/** Display name of the PSP bank behind a handle, including banks outside the console. */
export const pspName = (value: string): string | null => {
  const h = upiHandle(value);
  return UPI_HANDLES[h] ?? OTHER_HANDLES[h] ?? null;
};

/** Bank id for an IFSC (HDFC0001234 -> HDFC), or null. */
export const bankOfIfsc = (ifsc: string): string | null => IFSC_BANKS[ifsc.trim().toUpperCase().slice(0, 4)] ?? null;
