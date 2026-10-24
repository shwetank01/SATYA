"""KAVACH masking, server side (Section 7.3).

The phone already masks before anything leaves it. VIVEK masks again before every AI
call, as defence in depth. This is the oracle (spec/reference/mask_ref.py) verbatim, so
the two can never drift; tests/test_mask.py runs the shared vectors against it.
"""
import re

__all__ = ["mask", "luhn"]

_EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+')
_UPI = re.compile(r'[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}\b')
_LINK = re.compile(r'(?i)\b(?:https?://)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:/[^\s]*)?')
_KEEP = re.compile(r'(?<!\d)(?:1600\d{6}|140\d{7}|1800\d{4,7}|1860\d{6,7})(?!\d)')
_CARD = re.compile(r'(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)')
_AADHAAR = re.compile(r'(?<!\d)(?:\d{4}\s\d{4}\s\d{4}|\d{12})(?!\d)')
_PHONE = re.compile(r'(?:\+91[\s-]?|(?<!\d)0)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)')
_ACCOUNT = re.compile(r'(?<!\d)\d{9,18}(?!\d)')
_PAN = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b')
_IFSC = re.compile(r'\b[A-Z]{4}0[A-Z0-9]{6}\b')
_CODE = re.compile(r'(?<!\d)\d{4,8}(?!\d)')
_AMOUNT_PREFIX = re.compile(r'(rs\.?|₹|inr)\s*$')


def luhn(d):
    s = 0
    for i, c in enumerate(reversed(d)):
        n = int(c)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        s += n
    return s % 10 == 0


def mask(text, my_names=(), my_phones=()):
    counters = {"UPI": 0, "LINK": 0, "PHONE": 0}
    seen = {}
    keep = []

    def tok(kind, val):
        key = (kind, val)
        if key not in seen:
            counters[kind] += 1
            seen[key] = f"[{kind}_{counters[kind]}]"
        return seen[key]

    text = _EMAIL.sub('[EMAIL]', text)
    text = _UPI.sub(lambda m: tok("UPI", m.group(0).lower()), text)

    def urlrep(m):
        s = m.group(0)
        tail = ''
        while s and s[-1] in '.,;:!?)':
            tail = s[-1] + tail
            s = s[:-1]
        return tok("LINK", s.lower()) + tail

    text = _LINK.sub(urlrep, text)

    def keeprep(m):
        keep.append(m.group(0))
        return f"\x00{len(keep) - 1}\x00"

    text = _KEEP.sub(keeprep, text)

    def cardrep(m):
        d = re.sub(r'\D', '', m.group(0))
        return '[CARD]' if luhn(d) else m.group(0)

    text = _CARD.sub(cardrep, text)
    text = _AADHAAR.sub('[AADHAAR]', text)

    def phonerep(m):
        d = re.sub(r'\D', '', m.group(0))[-10:]
        return '[MY_PHONE]' if d in my_phones else tok("PHONE", d)

    text = _PHONE.sub(phonerep, text)
    text = _ACCOUNT.sub('[ACCOUNT]', text)
    text = _PAN.sub('[PAN]', text)
    text = _IFSC.sub('[IFSC]', text)
    before = text

    def coderep(m):
        pre = before[max(0, m.start() - 5):m.start()].lower()
        return m.group(0) if _AMOUNT_PREFIX.search(pre) else '[CODE]'

    text = _CODE.sub(coderep, text)
    for n in my_names:
        if len(n) >= 3:
            text = re.sub(r'(?i)\b' + re.escape(n) + r'\b', '[NAME]', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: keep[int(m.group(1))], text)
