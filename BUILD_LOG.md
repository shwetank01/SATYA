# SATYA BUILD LOG

| Phase | Started | Gate | Result | Notes |
|---|---|---|---|---|
| 0 Scaffold | 2026-10-24 12:55 IST | rules_ref / mask_ref / pay_ref ALL PASS | **PASS** | rules 17/17 (15 v1.0 + T09, N08), mask 10/10, pay 3/3. Registry authored from official sources (`spec/satya_bank_promises.json`). |
| 1 Core | 2026-10-24 13:05 IST | gradle :core:test, vitest, pytest mask | **PASS** | Kotlin :core 11 tests (17 rule cases, 10 mask, 9 hash + day token + ticket, router, verdict); vitest 48 (rules, mask, hash, Pay Check P01-P03, crypto App. D); pytest 11 (mask vectors + oracle parity). |
| 2 DB + seed | 2026-10-24 16:25 IST | doctor --only db (C5, C11), seed idempotent | **PARTIAL** | schema.sql + cron.sql generated from Section 12; 7 PGlite (real Postgres) tests pass: atomic ingest, mismatch rejection, idempotent sightings, injection-safe prefix lookup, kill scoped to bank, RLS isolation, anon/authenticated cannot execute service functions, pay RLS. seed.ts written. **Blocked:** Supabase provisioning needs the marketplace terms accepted in Vercel. |
| 3 Gateway | 2026-10-24 16:36 IST | doctor C1 C2 C3 C4 C6 C7 (local, prod) | **PARTIAL** | 16 routes deployed to https://satya-gateway.vercel.app (Mumbai, bom1). C4b (Doctor seal + receipt signature) PASS against prod. C1-C4, C6, C7 fail only on `db not reachable` until Supabase exists. |
| 4 VIVEK + AI | 2026-10-24 16:22 IST | doctor C8 C9 C10, model eval | **PARTIAL** | satya-ai worker (Qwen3 + Whisper on Workers AI) 8 tests, SETU 3 tests, VIVEK 21 tests (re-mask before AI, fallbacks, PyAV decode, no temp files). **Blocked:** `wrangler login` and `modal token new` were not approved yet. |
| 5 Console | 2026-10-24 16:34 IST | doctor --e2e, Pay Check P01-P03 in UI | **BUILT** | 12 pages, next build clean, vitest 57/57 (incl. Pay Check P01-P03 logic and Radar grouping). Live at /login; E2E waits on Supabase. |
| 6 Android | 2026-10-24 14:12 IST | one-door, Doctor D1-D19 on A and B, sequences A + B | **PASS (emulator, local protocols)** | one-door script PASS. Doctor 14/19 on Android 15 emulator; the 5 failures are cloud-only (D11 herd, D14-D17 VIVEK). D8 17/17, D9 10/10, D12/D13 phone-sealed box opened by the live gateway. Sequence A works end to end (banner in ~1.5 s). Samsung run pending (no phone connected). Version 1 APK in VERSIONS/Version 1. |
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

### CLI, prod (2026-10-24 16:40 IST)
```
FAIL  C1   Gateway health + db              db not reachable from the gateway
FAIL  C2   Registry ...                      HTTP 500 registry_unavailable
FAIL  C3   SANGH ...                         sighting HTTP 500
FAIL  C4   DOOT ...                          HTTP 500
PASS  C4b  Doctor seal endpoint              opened by the gateway, signed by RECEIPT_PK
C5-C12                                       waiting on Supabase / VIVEK / SETU accounts
```

### On device (Android 15 emulator, debug build)
```
PASS D1 accessibility · PASS D2 strip (right edge) · PASS D3 screenshot 1080x2340 · PASS D4 OCR 528 chars
PASS D5 SMS perms · PASS D6 call screening role · PASS D7 6 cards (assets) · PASS D8 17/17 · PASS D9 10/10
PASS D10 one KavachClient · FAIL D11 HTTP 500 (no db) · PASS D12 gateway opened phone seal · PASS D13 receipt + App. D
FAIL D14-D17 VIVEK not deployed · PASS D18 Room · PASS D19 SyncWorker enqueued
```

### Feature timings on the emulator
| Feature | Result |
|---|---|
| U2 SMS T01 -> SBI01 + G02 + G05 + banner | ~1.5 s from arrival (cold process) |
| U2 SMS burst | 3/3 checked at 4 s spacing; every SMS the phone received was checked |
| U3 call 18001800 -> PNB01 Critical | call allowed in 5 ms (Telecom log), banner shown |
| U1 Circle to Check (whole screen, SMS thread) | 3/3 correct (SBI01, G02, G05), 2.4-4.1 s |

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
| 9 | Console GET helpers on `/cards` and `/kill` (current card + this bank's blocklist) | The browser holds no app key and `promise_cards`/`indicators` have no RLS read policy | 10 |
| 10 | One dynamic `/vivek/[op]` route serves `/vivek/voice` and `/vivek/face` | Same paths and auth, one proxy | 10 |
| 11 | Vercel region bom1 (Mumbai) | Users and banks are in India | 4 |
| 12 | AGP 9.2.1 + Gradle 9.4.1 + compileSdk 37 | Compose BOM 2026.09 requires AGP >= 9.1 and compileSdk 37 | 13.1 |
| 13 | Release APK ships ARM ABIs only; debug adds x86_64 | Saves ~22 MB of ML Kit native code no phone needs | 13.1 |
| 14 | VIVEK also ships a Dockerfile and `run_local.sh` | Runs without Modal (laptop + Cloudflare tunnel, or any container host) | 11.2, 18 |
| 15 | KAVACH circuit breaker (20 s) + parallel herd lookups in a 3.5 s budget | A missing cloud must never slow a verdict | 8.3, 18 |
