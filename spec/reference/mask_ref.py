import re, json, sys

def luhn(d):
    s = 0
    for i, c in enumerate(reversed(d)):
        n = int(c)
        if i % 2 == 1:
            n *= 2
            if n > 9: n -= 9
        s += n
    return s % 10 == 0

def mask(text, my_names=(), my_phones=()):
    counters = {"UPI": 0, "LINK": 0, "PHONE": 0}; seen = {}; keep = []
    def tok(kind, val):
        key = (kind, val)
        if key not in seen:
            counters[kind] += 1; seen[key] = f"[{kind}_{counters[kind]}]"
        return seen[key]
    text = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', '[EMAIL]', text)
    text = re.sub(r'[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}\b', lambda m: tok("UPI", m.group(0).lower()), text)
    def urlrep(m):
        s = m.group(0); tail = ''
        while s and s[-1] in '.,;:!?)':
            tail = s[-1] + tail; s = s[:-1]
        return tok("LINK", s.lower()) + tail
    text = re.sub(r'(?i)\b(?:https?://)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:/[^\s]*)?', urlrep, text)
    def keeprep(m):
        keep.append(m.group(0)); return f"\x00{len(keep) - 1}\x00"
    text = re.sub(r'(?<!\d)(?:1600\d{6}|140\d{7}|1800\d{4,7}|1860\d{6,7})(?!\d)', keeprep, text)
    def cardrep(m):
        d = re.sub(r'\D', '', m.group(0)); return '[CARD]' if luhn(d) else m.group(0)
    text = re.sub(r'(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)', cardrep, text)
    text = re.sub(r'(?<!\d)(?:\d{4}\s\d{4}\s\d{4}|\d{12})(?!\d)', '[AADHAAR]', text)
    def phonerep(m):
        d = re.sub(r'\D', '', m.group(0))[-10:]
        return '[MY_PHONE]' if d in my_phones else tok("PHONE", d)
    text = re.sub(r'(?:\+91[\s-]?|(?<!\d)0)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)', phonerep, text)
    text = re.sub(r'(?<!\d)\d{9,18}(?!\d)', '[ACCOUNT]', text)
    text = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b', '[PAN]', text)
    text = re.sub(r'\b[A-Z]{4}0[A-Z0-9]{6}\b', '[IFSC]', text)
    before = text
    def coderep(m):
        pre = before[max(0, m.start() - 5):m.start()].lower()
        return m.group(0) if re.search(r'(rs\.?|₹|inr)\s*$', pre) else '[CODE]'
    text = re.sub(r'(?<!\d)\d{4,8}(?!\d)', coderep, text)
    for n in my_names:
        if len(n) >= 3: text = re.sub(r'(?i)\b' + re.escape(n) + r'\b', '[NAME]', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: keep[int(m.group(1))], text)

if __name__ == "__main__":
    V = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "spec/mask_vectors.json"))["vectors"]
    ok_all = True
    for v in V:
        out = mask(v["in"], v["my_names"], v["my_phones"]); ok = out == v["out"]; ok_all &= ok
        print("PASS" if ok else "FAIL", "|", out)
    print("ALL PASS" if ok_all else "SOME FAILED"); sys.exit(0 if ok_all else 1)
