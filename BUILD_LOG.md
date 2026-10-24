# SATYA BUILD LOG

| Phase | Started | Gate | Result | Notes |
|---|---|---|---|---|
| 0 Scaffold | 2026-10-24 12:55 IST | rules_ref / mask_ref / pay_ref ALL PASS | **PASS** | rules 17/17 (15 v1.0 + T09, N08), mask 10/10, pay 3/3. Registry authored from official sources (`spec/satya_bank_promises.json`). |
| 1 Core | 2026-10-24 13:05 IST | gradle :core:test, vitest, pytest mask | **PASS** | Kotlin :core 11 tests (17 rule cases, 10 mask, 9 hash + day token + ticket, router, verdict); vitest 48 (rules, mask, hash, Pay Check P01-P03, crypto App. D); pytest 11 (mask vectors + oracle parity). |
| 2 DB + seed | | doctor --only db (C5, C11), seed idempotent | | |
| 3 Gateway | | doctor C1 C2 C3 C4 C6 C7 (local, prod) | | |
| 4 VIVEK + AI | | doctor C8 C9 C10, model eval | | |
| 5 Console | | doctor --e2e, Pay Check P01-P03 in UI | | |
| 6 Android | | one-door, Doctor D1-D19 on A and B, sequences A + B | | |
| 7 Hardening | | full demo script x2, Doctor green after reboot | | |

## Phase 0 gate output

```
$ python spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json
PASS T01 SBI [G02 high, G05 high, SBI01 critical]   PASS T02 HDFC [G01 critical, G03 high]
PASS T03 PNB [G06 critical, PNB01 critical]          PASS T04 ICICI [G03 high, G07 critical]
PASS T05 AXIS [AXIS_EMAIL high, G02 high]            PASS T06 HDFC []   PASS T07 SBI []
PASS T08 ICICI [G03 medium]  PASS N01-N03 []  PASS N04 SBI [G01 critical, G05 high]
PASS N05 []  PASS N06 []  PASS N07 SBI [G03 high, G04 medium]
PASS T09 SBI [G03 high, G08 high]  PASS N08 SBI []
ALL PASS
$ python spec/reference/mask_ref.py spec/mask_vectors.json      -> 10 PASS, ALL PASS
$ python spec/reference/pay_ref.py spec/paycheck_cases.json     -> P01 P02 P03 PASS, ALL PASS
```

## Doctor output (latest)
(none yet)

## Model eval
(pending Phase 4)

## Deviations from SATYA_ARCHITECTURE.md
Each one is also written into the architecture file (Section 21, v1.1).

| # | What | Why | Section updated |
|---|---|---|---|
| 1 | Added G08_NO_KYC_FEE and check type `asks_fee_with_phrase`; cases T09, N08 | The design's headline demo (KYC fee to a UPI ID) broke no v1.0 promise except G03 | 8.2, 8.2 AI mapping, App. A, App. F.1, 21 |
| 2 | Oracle opens JSON as UTF-8 | Hindi promise text crashed the oracle on Windows (cp1252 default) | App. F.1 |
| 3 | AI provider = SATYA's own Cloudflare Workers AI gateway (`ai-worker/`, Qwen + Whisper) instead of Groq | User asked for a free, open-weights model that we host; stays OpenAI-compatible so Groq is a config change | 6.2, 21 |
| 4 | Receipt gains `kill_chain_stage` + `verdict` (Breaks / Keeps / Unknown); design word "Genuine" replaced by "Keeps promise" + "This does not prove it is safe." | Design needs a kill-chain bar; architecture forbids claiming safety | 9.5 |
| 5 | Samsung defaults: edge strip on the left on Samsung; Samsung package IDs; PhoneStateReceiver fallback for U3 | Prototype is tested on a Samsung phone; One UI Edge Panel occupies the right edge; call screening role is not always grantable on One UI | 21 |
| 6 | Quick Settings tile trigger (+ MediaProjection fallback) | It is the primary trigger in the design | 21 |
| 7 | Doctor reliability mode (pass rate + median latency over N runs) | User asked for a success rate per feature on the Samsung test phone | 21 |
| 8 | Design bundle copied without `uploads/` | Third-party inspiration images, not ours to publish in a public repo | 5 |
