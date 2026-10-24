// Regex building blocks matching Python 3 `re` on str (the oracle). JavaScript's \b, \d and \s
// are ASCII-only, so every class is spelled out with Unicode properties (requires the `u` flag).

/** Python \w on str. */
export const W = String.raw`[\p{L}\p{N}_]`;
/** Python \d on str. */
export const D = String.raw`\p{Nd}`;
export const ND = String.raw`[^\p{Nd}]`;
/** Python \s on str. */
export const S = String.raw`[\s\u001C-\u001F\u0085   -     　]`;
export const S_INNER = String.raw`\s\u001C-\u001F\u0085   -     　`;
export const NS = String.raw`[^\s\u001C-\u001F\u0085   -     　]`;
/** \b before a pattern that starts with a word character. */
export const B_START = String.raw`(?<![\p{L}\p{N}_])`;
/** \b after a pattern that ends with a word character. */
export const B_END = String.raw`(?![\p{L}\p{N}_])`;

export const EMAIL = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+`;
export const UPI = String.raw`[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}` + B_END;
/** Link with the host captured in group 1. Use with flags 'giu'. */
export const LINK = B_START + String.raw`(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?:\/` + NS + String.raw`*)?`;

export const re = (src: string, flags = 'gu') => new RegExp(src, flags);

/** Python int(c) for any Unicode decimal digit. */
export function digitValue(c: string): number {
  const cp = c.codePointAt(0)!;
  if (cp >= 48 && cp <= 57) return cp - 48;
  // Unicode Nd digits come in contiguous blocks of ten starting at a code point ending in 0 or 6.
  for (const base of [0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0xff10]) {
    if (cp >= base && cp < base + 10) return cp - base;
  }
  return Number.NaN;
}
