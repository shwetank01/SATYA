# SATYA BUILD LOG

| Phase | Started | Gate | Result | Notes |
|---|---|---|---|---|
| 0 Scaffold | 2026-10-24 12:55 IST | rules_ref / mask_ref / pay_ref ALL PASS | **PASS** | rules 17/17 (15 v1.0 + T09, N08), mask 10/10, pay 3/3. Registry authored from official sources (`spec/satya_bank_promises.json`). |
| 1 Core | 2026-10-24 13:05 IST | gradle :core:test, vitest, pytest mask | **PASS** | Kotlin :core 11 tests (17 rule cases, 10 mask, 9 hash + day token + ticket, router, verdict); vitest 48 (rules, mask, hash, Pay Check P01-P03, crypto App. D); pytest 11 (mask vectors + oracle parity). |
| 2 DB + seed | 2026-10-24 16:25 IST | doctor --only db (C5, C11), seed idempotent | **PARTIAL** | schema.sql + cron.sql generated from Section 12; 7 PGlite (real Postgres) tests pass: atomic ingest, mismatch rejection, idempotent sightings, injection-safe prefix lookup, kill scoped to bank, RLS isolation, anon/authenticated cannot execute service functions, pay RLS. seed.ts written. **Blocked:** Supabase provisioning needs the marketplace terms accepted in Vercel. |
| 3 Gateway | 2026-10-24 16:36 IST | doctor C1 C2 C3 C4 C6 C7 (local, prod) | **PARTIAL** | 16 routes deployed to https://satya-gateway.vercel.app (Mumbai, bom1). C4b (Doctor seal + receipt signature) PASS against prod. C1-C4, C6, C7 fail only on `db not reachable` until Supabase exists. |
| 4 VIVEK + AI | 2026-10-24 16:22 IST | doctor C8 C9 C10, model eval | **PASS (self-hosted)** | Self-hosted on this laptop (`tools/local-cloud.sh --local`): Qwen3-4B on llama.cpp (Vulkan GPU) + VIVEK + in-process Whisper. CLI Doctor C8 10/10 (809 ms), C9 10/10, C10 10/10 (tmp files unchanged). VIVEK 24 tests. Ask eval: tuning 19/20, held-out 13/14. **Still blocked:** `wrangler login` (satya-ai worker, SETU) and `modal token new`; the public Cloudflare quick tunnel was refused by this session's safety policy, so the phone reaches VIVEK over USB (`adb reverse`). |
| 5 Console | 2026-10-24 16:34 IST | doctor --e2e, Pay Check P01-P03 in UI | **BUILT** | 12 pages, next build clean, vitest 57/57 (incl. Pay Check P01-P03 logic and Radar grouping). Live at /login; E2E waits on Supabase. |
| 6 Android | 2026-10-24 14:12 IST | one-door, Doctor D1-D19 on A and B, sequences A + B | **PASS (emulator)** | 0.2.0: Doctor 18/19 on the Android 15 emulator; Reliability x10 = 94% (180/190): every check 10/10 except D11 (gateway has no database yet). D14-D17 now pass against the self-hosted VIVEK. Samsung run pending (no phone connected). APKs in VERSIONS/Version 2. |
| 7 Hardening | 2026-10-25 03:30 IST | live E2E, Doctor on device, emulator flows | **PASS (emulator)** | 0.3.0: gateway on Vercel Blob + Sarvam; `scripts/smoke.ts` 15/15 against production; Doctor 19/19 on the Android 15 emulator. Samsung run pending (no phone connected). APKs in VERSIONS/Version 3. |

## Release 0.3.0 (2026-10-25)

What was broken in 0.2.0, reproduced on the emulator first:
- Report to bank stayed "Queued": `POST /reports` returned 500 (no database).
- Circle to Check put status-bar icon labels into the message.
- Back did nothing after repeated deep links.
- Know Your App flagged genuine bank apps.

All four are fixed (Section 22 of the architecture).

### Live gateway, `npx tsx --env-file=.env.local scripts/smoke.ts` (production, 2026-10-25 04:00 IST)
```
PASS  health                             store true, ai sarvam-105b · 778 ms
PASS  registry (signed cards + blocklist) 5 banks · 125 ms
PASS  AI analyze (Sarvam)                pay_fee / scam (0.95) · 1316 ms
PASS  herd sighting + lookup             seen_7d 1 · 416 ms
PASS  report sealed to SBI, receipt verifies · 3490 ms
PASS  phone status = delivered
PASS  console refuses without a session  401
PASS  console login (SBI)                State Bank of India
PASS  inbox lists the report
PASS  bank opens the box in "browser"
PASS  AI case brief                      block · 1373 ms
PASS  kill -> blocked for everyone       1 report(s) closed
PASS  phone status = blocked
PASS  registry carries the block
PASS  herd shows confirmed_by SBI
ALL PASS
```

### Sarvam labelling, `scripts/eval-sarvam.ts` (same 34 cases as the 0.2.0 model eval)
| Model | Tuning | Held-out | Bank | Median |
|---|---|---|---|---|
| sarvam-105b, reasoning off, JSON mode | 18/20 | 13/14 | 18/20, 14/14 | 0.8 s |

Misses:
- A KYC-update link was labelled `click_link` instead of `kyc_update`. Both are scams, and the rule SBI01 fires anyway.
- "send the amount today itself" was labelled `other` instead of `move_money`.
- "5000 bhej de" was labelled `share_secret` instead of `move_money`. It adds no hit: the lexical-evidence guard (21.9) has no OTP or PIN word to match.

### On device, 0.3.0-debug, Android 15 emulator
```
Doctor Run all: 19 of 19 PASS
D11 SANGH round trip   PASS 122 ms (0/10 in 0.2.0)
D14 cloud store + AI   PASS 171 ms  (store on · AI sarvam-105b)
D15 T02 = share_secret PASS 838 ms  (Sarvam)
D16 face score         PASS 1131 ms (laptop VIVEK over adb reverse; optional, fails without it)
D17 voice STT          PASS 982 ms  (saaras:v3)
```

| Flow | Result |
|---|---|
| Circle to Check (edge strip) on an electricity-disconnection SMS | "Looks like a scam" in 3.3 s, with no status-bar text in the evidence |
| Circle to Check (accessibility button), whole screen | Same verdict in 1.7 s; the bank question is skipped because the AI says no bank is named |
| Report to SBI from the verdict sheet | Delivered in about 3 s; receipt signature verified on the phone |
| A report queued under 0.2.0 | Delivered by WorkManager once the store was live |
| Back from report status | Report status → Reports → Home |
| Know Your App | Only the FakeKYC demo is a suspect; "Ask SATYA AI" says "Risk high · pretends to be SBI" |
| Activation | The Convergence plays (frames checked), then the status screen |

## CI
`.github/workflows/ci.yml` (oracles + VIVEK, web, workers, android-core + one-door) has never run: GitHub answers
`HTTP 422: Actions has been disabled for this user` for the workblue21 account (checked 2026-10-25 with a manual
dispatch). Every suite it would run passes locally: oracles ALL PASS, Kotlin :core + :app unit tests, vitest 57,
VIVEK pytest 24, worker tests 8 + 3. The account owner has to lift the restriction in GitHub.

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

### On device (Android 15 emulator, 0.2.0-debug, VIVEK on the laptop via `adb reverse`)
```
Run all: 18 of 19 PASS (D11 HTTP 500: no database behind the gateway yet)
Reliability x10: Overall 94% (180/190)   (models: Qwen3-4B, whisper-small, mo-thecreator voice, dima806 face)
D1  accessibility          10/10   0 ms    D11 SANGH round trip      0/10 137 ms
D2  edge strip             10/10   0 ms    D12 DOOT seal opened      10/10 133 ms
D3  screenshot             10/10 552 ms    D13 receipt + App. D      10/10   0 ms
D4  OCR thumbnail          10/10 2059 ms   D14 VIVEK health          10/10  70 ms
D5  SMS permissions        10/10   0 ms    D15 ask T02=share_secret  10/10 827 ms
D6  call screening         10/10   1 ms    D16 face score            10/10 191 ms
D7  registry 6 cards       10/10   0 ms    D17 voice score + STT     10/10 927 ms
D8  rules 17/17            10/10 180 ms    D18 SAKSHI Room           10/10  20 ms
D9  masking 10/10          10/10  15 ms    D19 SyncWorker            10/10  12 ms
D10 one door               10/10   0 ms
```

### CLI, VIVEK self-hosted (2026-10-24 23:58 IST, `VIVEK_URL=http://127.0.0.1:8000 doctor.ts --only vivek|ai --repeat 10`)
```
PASS  C8   VIVEK health, ask(T02) = share_secret          10/10  809 ms  share_secret via ai
PASS  C9   provider lists chat + STT models               10/10   31 ms  127.0.0.1:8081 (qwen3-4b), STT local
PASS  C10  VIVEK tmp files unchanged, gateway no echo     10/10  869 ms
```

### Feature timings on the emulator
| Feature | Result |
|---|---|
| U2 SMS T01 -> SBI01 + G02 + G05 + banner | ~1.5 s from arrival (cold process) |
| U2 SMS burst | 3/3 checked at 4 s spacing; every SMS the phone received was checked |
| U3 call 18001800 -> PNB01 Critical | call allowed in 5 ms (Telecom log), banner shown |
| U1 Circle to Check (whole screen, SMS thread) | 3/3 correct (SBI01, G02, G05), 2.4-4.1 s |

## Model eval

### Chat model for /v1/ask (`vivek/eval/eval_ask.py`, 20 tuning + 14 held-out masked cases, EN/HI/Hinglish)
| Model (self-hosted, llama.cpp, RTX 3050 Vulkan) | Prompt | Tuning | Held-out | Bank | Median |
|---|---|---|---|---|---|
| Qwen2.5-1.5B-Instruct Q4_K_M | Appendix H | 15/20 | - | 8/20 | 0.48 s |
| Qwen3-4B Q4_K_M | Appendix H | 16/20 | 10/14 (71%) | 17/20, 12/14 | 0.77 s |
| **Qwen3-4B Q4_K_M (chosen)** | Appendix H + guidance + 5 few-shot | **19/20** | **13/14 (92%)** | 19/20, 14/14 | 0.78 s |

Remaining misses: "share your pin code for delivery" -> share_secret, and "5000 bhej de" -> share_secret.
Neither can raise a false alarm: the phone adds an AI-assisted hit only with lexical evidence
(no OTP/PIN/code word in either), and never over an official channel (Section 21.9-21.10).
Qwen2.5-3B was rejected: its licence is not open source.

### Speech-to-text (self-hosted, `AI_STT_MODEL=local:openai/whisper-small`, int8, CPU)
| Clip | Result | Time |
|---|---|---|
| Hindi speech 4.1 s | मिर्ची में कितने विबिन्ना प्रजात्या है (lang hi) | 2.3 s |
| English speech 3.3-10.4 s | accurate | 1.7-2.2 s |
| Tone / silence / noise | no-speech gate (P 0.74-0.92), empty transcript | 0.7 s (was 10.3 s) |

### Deepfake classifiers (`vivek/eval/eval_models.py`, CPU, threshold 0.7, faces cropped by VIVEK's own `crop_faces`)
Samples (gitignored, sources in `eval/samples/SOURCES.md`): 6 real voices (LibriSpeech, LibriVox, a Hindi clip) +
8 synthetic (Piper TTS, EN + HI scam-call scripts, `eval/make_fake_voices.py`); 7 real faces (US government
official portraits, public domain) + 8 StyleGAN faces (thispersondoesnotexist.com). All candidates Apache-2.0.

| Kind | Model | Correct | Median | |
|---|---|---|---|---|
| Voice | MelodyMachine/Deepfake-audio-detection-V2 (was configured) | 5/14 | 0.44 s | dropped |
| Voice | **mo-thecreator/Deepfake-audio-detection** (wav2vec2-base) | **11/14** | 0.47 s | **chosen** |
| Voice | Gustking/wav2vec2-large-xlsr-deepfake-audio-classification | 10/14 | 1.24 s | |
| Voice | MelodyMachine/Deepfake-audio-detection · Vansh180/deepfake-audio-wav2vec2 | 7/14 · 6/14 | | |
| Face | prithivMLmods/Deep-Fake-Detector-v2-Model (was configured) | 1/15 | 0.14 s | dropped |
| Face | **dima806/deepfake_vs_real_image_detection** (ViT-base) | **13/15** | 0.14 s | **chosen** |
| Face | samibelyo/deepfake_vs_real_image_detection · manh08/... | 13/15 · 12/15 | 0.14 s | |

Chosen models: real voices 5/6 right (one Spanish LibriVox clip scored fake), Piper voices 6/8 caught; real faces
7/7 right, GAN faces 6/8 caught. Small sample and classic TTS/GAN fakes, not modern voice clones: these scores stay
a supporting signal and never decide the verdict (law 3). Doctor D16/D17 and CLI C8 pass 10/10 with them.

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
| 16 | AI label needs lexical evidence; official channel (Keeps) suppresses AI-assisted hits | A model guess must never flag a genuine OTP SMS or debit alert | 21.9, 21.10 |
| 17 | VIVEK appends guidance + few-shot after the verbatim Appendix H prompt | Measured +3 tuning, +3 held-out cases on Qwen3-4B at the same latency | 21.11 |
| 18 | Self-hosted AI: Qwen3-4B on llama.cpp + in-process Whisper (`local:` STT); VIVEK private temp dir | Cloud logins not approved; Section 18 backup path made real | 21.12 |
| 19 | `network_security_config.xml` (cleartext only to loopback) replaces `usesCleartextTraffic="false"` | Lets a USB test phone use a laptop VIVEK via `adb reverse` without a public tunnel | 13.2, 21.13 |
| 20 | AI on Sarvam behind the gateway; explanation fields; AI asked on every user check | Cloud AI worked only with the laptop on USB; Sarvam was requested | 22.1, 22.2 |
| 21 | Verdict `suspicious` ("Looks like a scam") from a confident AI when no rule matched | Scams outside the Promise Cards (bills, parcels) showed only "Unknown" | 22.3 |
| 22 | Gateway storage on a private Vercel Blob store | Supabase terms not accepted; reports were never delivered | 22.4 |
| 23 | NYAYA: three features, password + signed-cookie sign-in | The console needed Supabase Auth to open at all | 22.5 |
| 24 | Capture skips System UI and button labels | Status-bar text polluted checks and reports | 22.6 |
| 25 | Know Your App: suspects only off-store; KnownApps; watchlist pruning | Genuine bank apps were flagged and their PIN screens blocked | 22.7 |
| 26 | Accessibility button trigger; Convergence activation; navigation fixes; report to any bank | Requested features and emulator findings | 22.8-22.11 |
