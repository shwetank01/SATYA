# What we built

**SATYA · RAKSHAM AI Cybersecurity Hackathon, IIT Delhi · Problem Statement 03**

This is the inventory of what exists in this repository, how each part is built, and how we checked that it works. The idea behind it is in [`SOLUTION.md`](SOLUTION.md).

---

## At a glance

| Part | What it is | Built with | State |
|---|---|---|---|
| **SATYA app** | Android app that checks messages, calls and screens against bank promises | Kotlin 2.3, Jetpack Compose, Android 11+ | 0.3.0 signed APK; Doctor 19/19 on the emulator |
| **Rules engine** (`:core`) | The promise rules, masking and hashing, with no Android dependencies | Pure Kotlin, tested against shared vectors | 17 rule cases, 10 masking vectors pass |
| **Gateway** | API between phones, institutions and partner systems | Next.js 16 on Vercel (Mumbai), private Vercel Blob storage | Live at `satya-gateway.vercel.app` |
| **SATYA AI** | Labels the ask and explains it in English and Hindi; speech-to-text | Sarvam `sarvam-105b` and `saaras:v3`, server-side key | 31/34 on the labelled set, 0.8 s median |
| **NYAYA console** | Console for bank fraud desks and company finance teams | Next.js, React 19, libsodium in the browser | 10 features in code (0.4.0); 3 live (0.3.0) |
| **Specification** | The single source of truth, with reference code | Markdown, Python oracles, JSON vectors | Every language must match the oracles |
| **Optional services** | Self-hosted AI and deepfake scores, privacy relay, Postgres schema | FastAPI, Cloudflare Workers, Postgres | Built and tested; not hosted publicly |

## 1. The SATYA app (Android)

### What a user gets

- **Circle to Check.** Freeze the screen, circle a message, and get a verdict. It can start in three ways:
  - triple-tap the yellow edge strip (on the left on Samsung, where One UI's Edge Panel does not sit);
  - tap the *Check screen* Quick Settings tile;
  - use Android's accessibility button, gesture or shortcut.
- **Share to SATYA.** Share a screenshot (read on the phone with ML Kit OCR, in English and Devanagari), some text, or a voice note.
- **Background guard.** New SMS, WhatsApp messages and incoming calls are checked against the rules on the phone. A heads-up banner appears when a promise is broken. Nothing is uploaded.
- **Proof Receipt.** It shows:
  - the verdict (*Breaks promise*, *Looks like a scam*, *Keeps promise*, *Unknown*);
  - the broken promise with its official source;
  - the kill-chain stage and the herd count;
  - the SATYA AI reading;
  - a Hindi version that can be read aloud;
  - a "Lost money? Call 1930" card.
- **Report to bank.** Sealed on the phone to the bank's public key, delivered with a signed receipt, and followed from Delivered through to Blocked for everyone.
- **Know Your App.** Flags sideloaded apps posing as bank or KYC apps, blocks their PIN and OTP screens (Suspect Watch), and offers an AI second opinion.
- **Privacy Log.** Lists every byte that left the phone, in plain words.
- **Activation.** Plays "The Convergence" from the SATYA Brand Guide, then an honest status screen showing which protections are on.
- **Doctor.** 19 self-tests, plus a 10-run reliability mode for a demo phone.

### How it is organised

The app is built as seven protocols. Each one is a package in `android/app/src/main/java/app/satya/`.

| Protocol | Job | Key pieces |
|---|---|---|
| **DRISHTI** (sees) | Screen capture, OCR, SMS, calls, share sheet, edge strip, tile, accessibility button | `SatyaA11yService`, `CaptureEngine`, `CheckSession`, `CheckTileService` |
| **PRAHARI** (guards) | Runs the rules, merges herd, AI and reality signals into a receipt | `CheckRunner`, `KnowYourApp`, `CallCheck`, `RealityCheck` |
| **KAVACH** (shields) | Masks the user's details, and is the **only** network client | `Kavach` (packet factory), `KavachClient` (the single OkHttp client) |
| **VACHAN** (promises) | Downloads and verifies signed Promise Cards and the blocklist every 15 minutes | `RegistryStore`, `SyncWorker` |
| **SANGH** (counts) | Herd lookups by 5-character fingerprint prefix | `CheckRunner.herdFor` |
| **DOOT** (delivers) | Seals reports, queues delivery and tracks status | `Doot`, `ReportSendWorker`, `StatusPoller` |
| **SAKSHI** (witness) | Local database: checks, reports, Privacy Log, watchlist | Room (`SakshiDb`) |

The rules themselves live in a separate pure-Kotlin module, `android/core`, so they can be tested on a laptop without a phone.

### Technology

- Kotlin 2.3.20, Jetpack Compose (BOM 2026.09), AGP 9.2.1, compileSdk 37, minSdk 30.
- **Crypto:** libsodium (Lazysodium) for Ed25519 signatures and sealed boxes.
- **OCR and faces:** ML Kit text recognition (Latin and Devanagari) and face detection.
- **Storage and background work:** Room, DataStore, WorkManager.
- **Networking:** OkHttp 5 and kotlinx.serialization.
- The release is ARM-only, 72.7 MB, and signed with a stable release key (certificate SHA-256 `019716ca…a881`), so every version installs as an update.

## 2. The rules and the specification

- [`SATYA_ARCHITECTURE.md`](SATYA_ARCHITECTURE.md) is the build specification. Every deviation from it is recorded in its Sections 21–23 and in [`BUILD_LOG.md`](BUILD_LOG.md).
- [`spec/satya_bank_promises.json`](spec/satya_bank_promises.json) is the Promise Registry:
  - **12 rules**: 8 global (G01–G08), plus 4 for SBI, Axis and PNB;
  - official channels (SMS headers, toll-free numbers, domains, apps) for SBI, HDFC, ICICI, Axis and PNB;
  - each rule's source link. The source documents (7 PDFs) are in [`data/bank-rules/`](data/bank-rules/).
- [`spec/reference/`](spec/reference/) holds the Python **oracles** for the rules, masking and Pay Check. The Kotlin and TypeScript versions must give exactly the same answers on the shared vectors in [`spec/`](spec/): 17 rule cases, 10 masking cases, 3 Pay Check cases, plus hashing and crypto vectors.

## 3. The gateway (Next.js on Vercel)

One Next.js 16 app in [`web/`](web/), deployed to Vercel in Mumbai (`bom1`), serves phones, institution consoles and partner systems.

| Area | Routes (under `/api/v1`) | Notes |
|---|---|---|
| Registry | `GET /registry` | Root-signed Promise Cards (or a bank's own published card) plus the live blocklist |
| Herd | `GET /herd/{prefix}`, `POST /herd/sighting` | k-anonymous; one sighting per phone per day, with no IP stored |
| Reports | `POST /reports`, `GET /reports/{id}/status`, opened / dismiss / sealed | The gateway signs a delivery receipt; it cannot open the sealed box |
| AI | `POST /ai/analyze`, `/ai/voice`, `/ai/app`, `/ai/brief` | Sarvam; text is masked again; answers are clamped to known values |
| Blocklist | `POST /kill`, `GET /kill` | Only fingerprints and masked labels are stored |
| Console | `/console/login`, `/me`, `/logout`, `/check` and the 0.4.0 feature routes | HMAC-signed HttpOnly session cookie, with a named analyst |
| Partners | `POST /partner/check` | Scam Check API: per-bank keys stored as hashes, metered, daily cap |
| Companies | `/pay/rules`, `/pay/checks` | Pay Check decisions with signed receipts |

How it stores data and keeps secrets:
- **Storage** is a private Vercel Blob store. Every update is a compare-and-swap on the stored file's version, so phones writing at the same time cannot overwrite each other.
- **Secrets** live only in Vercel environment variables and a gitignored local file: the Sarvam key, the Blob token, the console password and secret, and the receipt signing key.
- A pre-commit hook ([`tools/secret_guard.py`](tools/secret_guard.py)) refuses any commit that contains one of them.

## 4. NYAYA, the institution console

Ten features, in the order a fraud desk works. They are built and tested in 0.4.0.

| Group | Feature | What it does |
|---|---|---|
| Detect | Fraud Overview | Reports, median time to act, values blocked, customers warned, and loss avoided (with its assumption on screen). CSV export of the case register. |
| | Impersonation Radar | Groups reports into campaigns by shared UPI IDs, numbers, sites and apps |
| | Report Inbox and Case Review | Opens sealed reports in the browser with the bank's key, with an AI case brief |
| Respond | One-Click Kill | Blocks for every SATYA phone and closes the matching reports |
| | Mule Watch | Routes confirmed fake accounts to the bank that holds them; private matching in the browser |
| Prevent | Promise Card Builder | The bank signs and publishes its official channels from the browser, with a before-and-after preview |
| | Scam Check copilot and API | The same verdict for agents, and a metered API for the bank's own channels |
| Govern | Named analysts and audit trail | Who did what, and when |
| Companies | Pay Check and Pay Rules | HOLD or CLEAR against the company's vendors, approvers, limits and channels, plus bank-confirmed fake accounts |
| | Verify Before Release and Evidence PDF | A recorded callback before release; signed decisions exported as a PDF |

The bank's Box and Sign keys are kept in the browser (IndexedDB) and never reach the server. Payment requests are read in the company's browser (pdf.js, Tesseract) and never leave it.

> **Live status.** `satya-gateway.vercel.app` currently runs **0.3.0**, which has three console features: Report Inbox, Scam Check and Blocklist. The 0.4.0 console is complete in this repository and passed its tests against a production build. It goes live when the maintainer runs `vercel deploy --prod` and seeds the demo data (`npm run demo:seed`).

## 5. Optional services (built, not hosted publicly)

| Folder | What | Why it is optional |
|---|---|---|
| [`vivek/`](vivek/) | FastAPI service: self-hosted Qwen3-4B, Whisper-small speech-to-text, and voice and face deepfake classifiers chosen by evaluation (voice 11/14, face 13/15) | Deepfake scores are a supporting signal; Sarvam covers labelling and speech-to-text |
| [`ai-worker/`](ai-worker/) | OpenAI-compatible AI endpoint on Cloudflare Workers AI | An alternative AI provider |
| [`setu/`](setu/) | Privacy relay on Cloudflare Workers that strips identifying headers | Extra network privacy |
| [`supabase/`](supabase/) | Postgres schema with row-level security and retention timers (7 tests on PGlite) | The path to bank scale, beyond Blob storage |

## 6. How we checked it works

| Check | Command | Result |
|---|---|---|
| Python oracles | `python spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json` | 17/17 rules, 10/10 masking, 3/3 Pay Check |
| Kotlin rules and app | `cd android && ./gradlew :core:test :app:testDebugUnitTest` | 17 tests pass |
| One door out | `bash tools/check_one_door.sh` | 3/3: one HTTP client, no raw connections, packets built only by KAVACH |
| Gateway and console | `cd web && npx vitest run` | 103 tests pass; every 0.4.0 commit passes on its own |
| Live end-to-end | `cd web && npm run smoke -- <url>` | 25/25 against a 0.4.0 production build; 15/15 against live production (0.3.0) |
| AI accuracy | `cd web && npx tsx --env-file=.env.local scripts/eval-sarvam.ts` | 18/20 tuning, 13/14 held out, 0.8 s median |
| On the phone | Settings → long-press the version → Doctor → Run all | 19/19 on the Android 15 emulator |
| Real flows on the emulator | Circle to Check, report to SBI, Back navigation, Know Your App, activation | All as expected; see `BUILD_LOG.md` |

The full outputs, timings and model evaluations are in [`BUILD_LOG.md`](BUILD_LOG.md).

## 7. Release history

| Version | Date | Highlights |
|---|---|---|
| 0.1.0 | 2026-10-24 | All phone protocols, design screens, Doctor; gateway, console, workers, VIVEK and schema |
| 0.2.0 | 2026-10-25 | Self-hosted AI; guards so an AI label cannot cause a false alarm |
| 0.3.0 | 2026-10-25 | Sarvam AI behind the gateway; report to bank works (Blob storage); capture reads only the app on screen; Know Your App fixed; accessibility-button trigger; The Convergence; NYAYA in three features |
| 0.4.0 | 2026-10-25 | NYAYA for institutions: ten features, named analysts and audit trail, Scam Check API, Pay Check for companies, demo data, business case |

Details are in [`CHANGELOG.md`](CHANGELOG.md).

## 8. What is real and what is demo

| Part | Status |
|---|---|
| Rules engine, masking, sealing, signatures, prefix lookups, AI calls | Real, and tested |
| Report delivery, Kill and herd counts on the live gateway | Real (production, 0.3.0) |
| Demo reports, campaigns, mule accounts and Acme's history in 0.4.0 | Written by `scripts/demo-data.ts`, flagged and labelled "Demo", and removable |
| Bank keys | Demo keys (`keys/demo_keys.json`), generated by `web/scripts/gen-keys.ts`. A real bank would generate its own. |
| Deepfake scores | Self-hosted only (`vivek/`); never decide a verdict |
| Samsung phone test | Not run yet; all device results are from the Android 15 emulator |

## 9. Run it yourself

The quick start in [`README.md`](README.md#quick-start) covers installing the APK, building the app, running the gateway and NYAYA locally, and the optional self-hosted AI. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the full setup, and [`SECURITY.md`](SECURITY.md) explains how secrets are handled.
