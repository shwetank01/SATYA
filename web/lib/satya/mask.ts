// KAVACH masking (Section 7.3), a line-by-line port of spec/reference/mask_ref.py.
import { B_END, B_START, D, EMAIL, LINK, ND, S, S_INNER, UPI, digitValue, re } from './rx';

const R_EMAIL = re(EMAIL);
const R_UPI = re(UPI);
const R_LINK = re(LINK, 'giu');
const R_KEEP = re(`(?<!${D})(?:1600${D}{6}|140${D}{7}|1800${D}{4,7}|1860${D}{6,7})(?!${D})`);
const R_CARD = re(`(?<!${D})(?:${D}[ -]?){12,18}${D}(?!${D})`);
const R_AADHAAR = re(`(?<!${D})(?:${D}{4}${S}${D}{4}${S}${D}{4}|${D}{12})(?!${D})`);
const R_PHONE = re(`(?:\\+91[${S_INNER}-]?|(?<!${D})0)?(?<!${D})[6-9]${D}{4}[${S_INNER}-]?${D}{5}(?!${D})`);
const R_ACCOUNT = re(`(?<!${D})${D}{9,18}(?!${D})`);
const R_PAN = re(`${B_START}[A-Z]{5}[0-9]{4}[A-Z]${B_END}`);
const R_IFSC = re(`${B_START}[A-Z]{4}0[A-Z0-9]{6}${B_END}`);
const R_CODE = re(`(?<!${D})${D}{4,8}(?!${D})`);
const R_AMOUNT_PREFIX = re(`(rs\\.?|₹|inr)${S}*$`, 'u');
const R_ND = re(ND);
const R_PLACEHOLDER = /\u0000(\d+)\u0000/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function luhn(digits: string): boolean {
  let sum = 0;
  [...digits].reverse().forEach((c, i) => {
    let n = digitValue(c);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return sum % 10 === 0;
}

export function mask(input: string, myNames: string[] = [], myPhones: string[] = []): string {
  const counters: Record<string, number> = { UPI: 0, LINK: 0, PHONE: 0 };
  const seen = new Map<string, string>();
  const keep: string[] = [];
  const tok = (kind: string, value: string) => {
    const key = kind + '\u0001' + value;
    let t = seen.get(key);
    if (!t) {
      counters[kind] += 1;
      t = `[${kind}_${counters[kind]}]`;
      seen.set(key, t);
    }
    return t;
  };

  let text = input.replace(R_EMAIL, '[EMAIL]');
  text = text.replace(R_UPI, (m) => tok('UPI', m.toLowerCase()));
  text = text.replace(R_LINK, (m) => {
    let s = m;
    let tail = '';
    while (s && '.,;:!?)'.includes(s[s.length - 1])) {
      tail = s[s.length - 1] + tail;
      s = s.slice(0, -1);
    }
    return tok('LINK', s.toLowerCase()) + tail;
  });
  text = text.replace(R_KEEP, (m) => {
    keep.push(m);
    return `\u0000${keep.length - 1}\u0000`;
  });
  text = text.replace(R_CARD, (m) => (luhn(m.replace(R_ND, '')) ? '[CARD]' : m));
  text = text.replace(R_AADHAAR, '[AADHAAR]');
  text = text.replace(R_PHONE, (m) => {
    const d = m.replace(R_ND, '').slice(-10);
    return myPhones.includes(d) ? '[MY_PHONE]' : tok('PHONE', d);
  });
  text = text.replace(R_ACCOUNT, '[ACCOUNT]');
  text = text.replace(R_PAN, '[PAN]');
  text = text.replace(R_IFSC, '[IFSC]');
  const before = text;
  text = before.replace(R_CODE, (m: string, offset: number) => {
    const pre = before.slice(Math.max(0, offset - 5), offset).toLowerCase();
    return R_AMOUNT_PREFIX.test(pre) ? m : '[CODE]';
  });
  for (const n of myNames) {
    if (n.length >= 3) text = text.replace(new RegExp(`${B_START}${escapeRe(n)}${B_END}`, 'giu'), '[NAME]');
  }
  return text.replace(R_PLACEHOLDER, (_m, i) => keep[Number(i)]);
}
