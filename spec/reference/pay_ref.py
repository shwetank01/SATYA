import re, json, sys, hashlib

def h(s): return hashlib.sha256(s.encode()).hexdigest()
def acct_key(acc, ifsc): return "acct:" + re.sub(r"\D", "", acc) + ":" + ifsc.upper()
URG = ["urgent", "urgently", "immediately", "asap", "right away", "today itself", "turant", "jaldi", "abhi"]
SEC = ["confidential", "secret", "don't tell", "dont tell", "do not tell", "keep it quiet", "between us", "kisi ko mat batana", "mat batana"]
SEV = {"NEW_ACCOUNT": "critical", "APPROVER_UNKNOWN": "high", "APPROVER_LIMIT": "high", "WRONG_CHANNEL": "high",
       "OVER_LIMIT": "medium", "URGENT_SECRET": "high", "SYNTHETIC_VOICE": "high", "NO_ACCOUNT_FOUND": "info"}

def has_any(t, words): return any(re.search(r'(?<![a-z])' + re.escape(w) + r'(?![a-z])', t) for w in words)
def amounts(text):
    t = text.lower(); out = []
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*(lakhs?|lacs?|l|crores?|cr)\b', t):
        out.append(round(float(m.group(1)) * (10 ** 7 if m.group(2).startswith('c') else 10 ** 5)))
    for m in re.finditer(r'(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d+)?)', t):
        out.append(round(float(m.group(1).replace(',', ''))))
    return max(out) if out else None
def accounts(text):
    accs = re.findall(r'(?<!\d)\d{9,18}(?!\d)', text)
    ifsc = re.findall(r'\b[A-Z]{4}0[A-Z0-9]{6}\b', text.upper())
    return [(a, ifsc[0] if ifsc else "") for a in accs]
def check(rules, c, voice_threshold):
    flags = []; text = c["text"]; amt = amounts(text)
    vend = {h(acct_key(v["account"], v["ifsc"])) for v in rules["vendors"]}
    accs = accounts(text)
    if not accs: flags.append("NO_ACCOUNT_FOUND")
    elif any(h(acct_key(a, i)) not in vend for a, i in accs): flags.append("NEW_ACCOUNT")
    appr = [a for a in rules["approvers"] if a["name"] == c["requester"]]
    if not appr: flags.append("APPROVER_UNKNOWN")
    elif amt is not None and amt > appr[0]["max_amount_inr"]: flags.append("APPROVER_LIMIT")
    if c["channel"] not in rules["allowed_channels"]: flags.append("WRONG_CHANNEL")
    if amt is not None and amt > rules["threshold_inr"]: flags.append("OVER_LIMIT")
    t = text.lower()
    if has_any(t, URG) and has_any(t, SEC): flags.append("URGENT_SECRET")
    if c.get("voice_score") is not None and c["voice_score"] >= voice_threshold: flags.append("SYNTHETIC_VOICE")
    dec = "hold" if any(SEV[f] in ("critical", "high") for f in flags) else "clear"
    return amt, sorted(flags), dec

if __name__ == "__main__":
    S = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "spec/paycheck_cases.json"))
    ok_all = True
    for c in S["cases"]:
        a, f, d = check(S["rules"], c, S["voice_threshold"])
        ok = a == c["expect_amount"] and f == sorted(c["expect_flags"]) and d == c["expect_decision"]; ok_all &= ok
        print("PASS" if ok else "FAIL", c["id"], a, f, d)
    print("ALL PASS" if ok_all else "SOME FAILED"); sys.exit(0 if ok_all else 1)
