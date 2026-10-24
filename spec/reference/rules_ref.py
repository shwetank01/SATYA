import re, json, sys

R = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "spec/satya_bank_promises.json", encoding="utf-8"))
CASES = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "spec/rule_cases.json", encoding="utf-8"))["cases"]

ALIASES = {"SBI": [["sbi"], ["state", "bank"], ["yono"]], "HDFC": [["hdfc"]], "ICICI": [["icici"], ["imobile"]],
           "AXIS": [["axis"]], "PNB": [["pnb"], ["punjab", "national"]]}
ASK_VERBS = [["share"], ["send"], ["tell"], ["give"], ["provide"], ["enter"], ["forward"], ["read"], ["type"],
             ["batao"], ["bata"], ["bataye"], ["bataiye"], ["bhejo"], ["bhej"], ["dijiye"], ["de", "do"], ["karo"],
             ["bolo"], ["बताओ"], ["बताइए"], ["भेजो"], ["दीजिए"]]
INSTALL_VERBS = [["install"], ["download"], ["kholo"], ["open"], ["use"], ["lagao"], ["daalo"], ["इंस्टॉल"], ["डाउनलोड"]]
TRANSFER_VERBS = [["move"], ["transfer"], ["send"], ["shift"], ["deposit"], ["bhejo"], ["daal"], ["dalo"], ["daalo"], ["jama"]]
CALL_VERBS = [["call"], ["callback"], ["dial"], ["contact"], ["phone"], ["sampark"]]
# v1.1: verbs for asks_fee_with_phrase (G08)
PAY_VERBS = [["pay"], ["send"], ["transfer"], ["deposit"], ["bharo"], ["bhar"], ["bhariye"], ["bhejo"], ["jama"], ["भरें"], ["भरो"], ["भेजें"], ["भेजो"], ["जमा"]]
NEG = ["not", "never", "dont", "don", "mat", "na", "nahi", "nahin", "kabhi", "नहीं", "मत"]
SALES = [["offer"], ["pre", "approved"], ["preapproved"], ["loan"], ["interested"], ["limit", "increase"], ["cashback"]]
KYC = [["kyc"], ["ekyc"], ["rekyc"], ["re", "kyc"], ["update", "pan"], ["pan", "update"], ["aadhaar", "update"], ["केवाईसी"]]
# Header codes used only to detect the claimed bank from an SMS header. ICICI/AXIS/PNB codes are placeholders until verified on smsheader.trai.gov.in.
HEADER_CODES = {"SBI": ["SBIINB", "SBIPSG", "SBICRD", "SBI"], "HDFC": ["HDFCBK", "HDFCBN", "HDFC"],
                "ICICI": ["ICICIB", "ICICI"], "AXIS": ["AXISBK", "AXIS"], "PNB": ["PNBSMS", "PNB"]}
WINDOW = 6

def toks(t): return re.findall(r"[a-z0-9ऀ-ॿ]+", t.lower())
def find(tk, phrase):
    n = len(phrase); return [i for i in range(len(tk) - n + 1) if tk[i:i + n] == phrase]
def finds(tk, phrases):
    out = []
    for p in phrases: out += find(tk, p)
    return out
def negated(tk, i): return any(w in NEG for w in tk[max(0, i - 3):i])
def verbs(tk, phrases): return [i for i in finds(tk, phrases) if not negated(tk, i)]
def secret_hits(tk, values):
    occ = []
    for v in values:
        p = toks(v)
        for i in find(tk, p):
            if p == ["pin"] and (i + 1 < len(tk) and tk[i + 1] == "code"): continue
            occ.append(i)
    return occ
def near(a, b, w=WINDOW): return any(abs(x - y) <= w for x in a for y in b)
def strip_ids(text):
    t = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', ' ', text)
    return re.sub(r'[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}\b', ' ', t)
def hosts(text):
    return [m.group(1).lower() for m in re.finditer(
        r'(?i)\b(?:https?://)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?:/[^\s]*)?', strip_ids(text))]
def digits(s): return re.sub(r'[^0-9x]', '', s.lower())
def national(s):
    d = digits(s)
    if len(d) == 12 and d.startswith("91"): d = d[2:]
    elif len(d) == 11 and d.startswith("0"): d = d[1:]
    return d
def plain_mobile(s): return re.fullmatch(r'[6-9][0-9x]{9}', national(s)) is not None
HEADER = re.compile(r'^([A-Z]{2}-)?(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,11}(-[STPG])?$')
def is_header(s): return HEADER.match(s.strip().upper()) is not None
def claimed(tk, sender=""):
    for b, al in ALIASES.items():
        if finds(tk, al): return b
    if is_header(sender):
        parts = sender.strip().upper().split("-")
        core = parts[1] if len(parts) > 1 else parts[0]
        for b, codes in HEADER_CODES.items():
            if any(core.startswith(c) for c in codes): return b
    return None
def ask_contains(tk, check):
    vals = check.get("values", []); hi = check.get("values_hi", [])
    if [h for h in hi if len(toks(h)) > 1 and find(tk, toks(h))]: return True
    sec = secret_hits(tk, vals + [h for h in hi if len(toks(h)) == 1])
    return bool(sec) and near(sec, verbs(tk, ASK_VERBS))

def evaluate(c):
    text = c.get("text", ""); ch = c["channel"]; sender = c.get("sender", "")
    tk = toks(text); bank = claimed(tk, sender); hits = []
    for g in R["global_promises"]:
        t = g["check"]["type"]; ck = g["check"]
        if t == "ask_contains_any" and ask_contains(tk, ck): hits.append((g["id"], g["if_broken"]))
        if t == "asks_install_any":
            occ = [i for v in ck["values"] for i in find(tk, toks(v))]
            if occ and near(occ, verbs(tk, INSTALL_VERBS)): hits.append((g["id"], g["if_broken"]))
        if t == "asks_transfer_with_phrase":
            occ = [i for v in ck["values"] for i in find(tk, toks(v))]
            if occ and near(occ, verbs(tk, TRANSFER_VERBS), 8): hits.append((g["id"], g["if_broken"]))
        if t == "asks_fee_with_phrase":
            occ = [i for v in ck["values"] for i in find(tk, toks(v))]
            if occ and near(occ, verbs(tk, PAY_VERBS)): hits.append((g["id"], g["if_broken"]))
        if not bank: continue
        bk = [b for b in R["banks"] if b["id"] == bank][0]
        if t == "link_host_suffix":
            allowed = ck["allowed_suffixes"]; extra = bk.get("extra_allowed_link_hosts", {}).get("values", [])
            for h in hosts(text):
                if not (any(h.endswith(s) for s in allowed) or any(h == e or h.endswith("." + e) for e in extra)):
                    hits.append((g["id"], g["if_broken"])); break
        if t == "caller_prefix" and ch in ("call", "whatsapp"):
            if plain_mobile(sender): hits.append((g["id"], ck["if_plain_10_digit_mobile"]))
            elif national(sender).startswith("1600") and finds(tk, SALES): hits.append((g["id"], ck["if_1600_used_for_selling"]))
        if t == "message_asks_callback_to_prefix":
            nums = [i for i, w in enumerate(tk) if w.isdigit() and any(w.startswith(p) for p in ck["prefixes"])]
            if nums and near(nums, verbs(tk, CALL_VERBS)): hits.append((g["id"], g["if_broken"]))
        if t == "sms_sender_is_header" and ch == "sms" and not is_header(sender): hits.append((g["id"], g["if_broken"]))
    for bk in R["banks"]:
        for p in bk["extra_promises"]:
            t = p["check"]["type"]; ck = p["check"]
            if t == "incoming_caller_in" and ch == "call" and national(sender) in ck["values"]: hits.append((p["id"], p["if_broken"]))
            if bk["id"] != bank: continue
            if t == "kyc_request_with_link" and finds(tk, KYC) and hosts(text): hits.append((p["id"], p["if_broken"]))
            if t == "email_sender_domain_in" and ch == "email":
                dom = sender.split("@")[-1].lower()
                if not any(dom == v or dom.endswith("." + v) for v in ck["values"]): hits.append((p["id"], p["if_broken"]))
            if t == "ask_contains_any" and ask_contains(tk, ck): hits.append((p["id"], p["if_broken"]))
    return bank, sorted(set(hits))

if __name__ == "__main__":
    ok_all = True
    for c in CASES:
        bank, h = evaluate(c)
        ids = sorted(i for i, _ in h); sev = {i: s for i, s in h}
        ok = ids == sorted(c["expected"]) and bank == c["claims"] and all(sev[i] == s for i, s in c["severity"].items())
        ok_all &= ok
        print("PASS" if ok else "FAIL", c["id"], bank, h)
    print("ALL PASS" if ok_all else "SOME FAILED"); sys.exit(0 if ok_all else 1)
