# SATYA_ARCHITECTURE.md

> Build specification for Claude Code.
> Project: SATYA, RAKSHAM AI Cybersecurity Hackathon (IIT Delhi), Problem Statement 03: Deepfake Detection for Financial Communications.
> Version 1.1, 2026-10-24 (v1.1 changes are listed in Section 21). This file is the single source of truth. If code and this file disagree, the file wins until it is updated on purpose.

---

## 0. HOW CLAUDE CODE MUST USE THIS FILE

1. Read this entire file before writing any code. Re-read the section for a protocol before building or changing that protocol.
2. Build in the exact phase order of Section 16. **Never start a phase until the previous phase's GATE passes.** Record every gate result in `BUILD_LOG.md` (template in Appendix G).
3. Ship all **P0** features before touching any **P1**. Ship P1 before P2. Priorities are in Section 1.3.
4. Never invent endpoints, fields, table columns, rule IDs or file formats that are not in this file. If something is missing, add it to this file first (small, explicit edit), then build it.
5. All three languages (Kotlin, TypeScript, Python) must pass the same shared test vectors in `spec/` (Appendices A to E). The Python reference implementations in Appendix F are the oracle. When in doubt, port them line by line.
6. Never commit secrets. Never print the AI API key, Supabase secret key, or any private key in logs, test output or `BUILD_LOG.md`.
7. The **AI model API key is provided by the user.** At the start of Phase 4, ask the user for it in one message (Section 6.4). Do not block earlier phases on it.
8. UI must follow the design files in `design/` (Section 13.8 and 14.6). Do not invent visual styles. Severity is shown as text labels (Critical, High, Medium). **No traffic-light (red/yellow/green) verdict metaphor anywhere.**
9. Prefer the boring, reliable option. This prototype cannot fail on stage. Every network feature has a fallback (Section 18).
10. After every phase, run the Doctor (Section 17) and paste the PASS/FAIL table into `BUILD_LOG.md`.

### 0.1 Human tasks (Claude Code asks the user for these, once, in Phase 0)

| # | Task | Needed by |
|---|---|---|
| H1 | Create a Supabase project (free). Give: Project URL, publishable/anon key, secret/service_role key, **Session pooler** connection string (Settings → Database → Connect). | Phase 2 |
| H2 | In Supabase Dashboard → Database → Extensions: enable **pg_cron**. | Phase 2 |
| H3 | Vercel account + `npm i -g vercel` + `vercel login`. | Phase 3 |
| H4 | Modal account + `pip install modal` + `modal token new`. | Phase 4 |
| H5 | AI provider API key (default Groq). If Groq: in Groq console → Data Controls, turn on **Zero Data Retention**. | Phase 4 |
| H6 | Android demo phone (Android 12 or newer) with USB debugging on, plus a second phone (Phone B). JDK 17 and Android SDK installed on the laptop. | Phase 6 |
| H7 | Put the design files into `design/`. | Phase 0 |
| H8 | Demo assets: 5 real + 5 synthetic voice clips, 5 real + 5 deepfake face images or short videos, one fake "CFO" voice note. | Phase 4 (eval), Phase 7 (demo) |
| H9 (optional) | Cloudflare account + `npm i -g wrangler` for SETU. | Phase 7 |

---

## 1. WHAT WE ARE BUILDING

SATYA checks what a financial message, call, link, app or voice **asks for** against what the bank has **officially promised** it will never ask for (the Promise Registry). Deepfake scores are a supporting signal, never the verdict. Two verticals share one engine.

### 1.1 User vertical: Android app (works mostly in the background)

| # | Feature | Trigger |
|---|---|---|
| U1 | **Circle to Check**: triple tap the screen edge, circle anything. Runs 4 checks and shows one **Proof Receipt**: Promise Check, Reality Check, Video Call Snap, Herd Signal | User |
| U2 | **Live Promise Check**: new SMS and WhatsApp messages checked in the background, banner on top | Background |
| U3 | **Call Promise Check**: caller number checked as the phone rings | Background |
| U4 | **Know Your App + Suspect Watch**: new apps checked at install, suspects watched for KYC/PIN screens | Background |
| U5 | **Voice Note Check**: share a voice note to SATYA | User |
| U6 | **Report Pack**: one tap sends a sealed report to the bank console; builds a complaint pack for cybercrime.gov.in; shows Call 1930 if money was lost | User |
| U7 | **Privacy Log + Watch List** | Always |
| U8 | **Sync**: registry, official apps and blocklist cached on the phone | Every 15 min |

### 1.2 Institution vertical: web console (NYAYA)

| # | Mode | Feature | Price |
|---|---|---|---|
| I1 | Bank | **Promise Card Builder** (sign and publish the bank's promises) | Free |
| I2 | Bank | **Impersonation Radar** (live reports grouped into campaigns) | Paid |
| I3 | Bank | **Case Review** (sealed report opened in the browser) | Paid |
| I4 | Bank | **Deepfake Re-check** (upload audio/video/image found elsewhere) | Paid |
| I5 | Bank | **One-Click Kill** (confirmed fake blocked for every SATYA user) | Paid |
| I6 | Company | **Pay Rules Setup** (vendors, approvers, channels, limits) | Paid |
| I7 | Company | **Pay Check** (every payment request checked before money moves) | Paid |
| I8 | Company | **Verify Before Release** (held payment unlocked only after a logged callback) | Paid |
| I9 | Company | **Evidence PDF** (signed record of the check and decision) | Paid |

### 1.3 Priorities

| Priority | Items |
|---|---|
| **P0 (must work on stage)** | U1 with Promise Check + Herd Signal, U2 for SMS, U3 (with Doctor "simulate call"), U6 send to bank, U7, I2, I3, I5, I7 (text + voice), I8, Doctor (CLI + on-device) |
| **P1** | U1 Video Call Snap + Reality Check, U2 for WhatsApp, U4 + fake KYC demo app, U5, U6 status polling, I1 edit and publish, I4, I9 |
| **P2** | SETU relay, complaint PDF, Hindi (Devanagari) OCR polish, seeded history beyond 20 reports |

---

## 2. THE 5 LAWS (enforced in code and checked by Doctor)

1. **Background never uploads content.** Only a user action (triple tap, share, report) can send text, images or audio off the phone. Background code may only send hash prefixes and sightings of already-flagged values.
2. **One door out.** Every byte leaving the phone goes through `KavachClient.send(packet)`. It accepts only `KavachPacket` objects, which only the KAVACH factory can create. There is exactly one `OkHttpClient` in the app.
3. **Rules run on the phone.** The cloud labels, scores and counts. It never makes the final verdict.
4. **The cloud processes in RAM and forgets (VISMRITI).** No user accounts for phone users, no IP logs, no device IDs, no request bodies in logs, no temp files.
5. **Only the bank can open a report.** Reports are sealed (libsodium sealed box) to the bank's public key on the phone. The cloud stores a box it cannot open.

---

## 3. SYSTEM MAP

```
PHONE (Android, Kotlin)
  DRISHTI (inputs) --> PRAHARI (local judge) --+--> SAKSHI (local log, receipts, report builder)
                                               |
                         DOOT (seal) ---------+--> KAVACH (masking + the only exit)
                                                        |
                                              [SETU relay, optional]
                                                        |
        +-----------------------------------------------+------------------------------+
        |                                                                              |
CLOUD PROCESSING (our infrastructure)                                       AI MODEL (external API)
  Vercel  : Next.js gateway  -> VACHAN, SANGH, DOOT inbox, console API        Provider key from user
  Supabase: Postgres, Auth, Realtime, pg_cron (VISMRITI timers)              (default Groq, any
  Modal   : VIVEK (FastAPI) -> deepfake classifiers we host  ---- calls --->  OpenAI-compatible API)
                                                                              chat + speech-to-text only
        |
NYAYA console (browser, same Next.js app on Vercel): decrypts reports in the browser
```

Backwards flows: VACHAN pushes cards, official apps and blocklist **down** to phones (sync + live herd lookup). NYAYA Kill writes **into** SANGH.

---

## 4. INFRASTRUCTURE SPLIT: CLOUD PROCESSING vs AI MODEL

| Layer | Provider | What runs there | Holds which secrets |
|---|---|---|---|
| Cloud processing: gateway + console | **Vercel** (Next.js App Router, Node runtime) | VACHAN, SANGH, DOOT inbox, all `/api/v1/*` routes, NYAYA pages | Supabase secret key, SATYA Receipt key, Doctor box key, APP_KEY, VIVEK URL |
| Cloud processing: data | **Supabase** (free) | Postgres tables, RLS, Auth for console users, Realtime, pg_cron | n/a |
| Cloud processing: compute | **Modal** (Starter plan, $30/month free credits) | VIVEK: FastAPI app, deepfake audio + face classifiers (open models we host), masking, AI proxy | AI API key, APP_KEY |
| **AI model** | **External API, key given by the user** | LLM ask-labeling + speech-to-text **only** | Lives only in Modal secret `satya-vivek` |

Rules:
- VIVEK is the **only** component that talks to the AI provider. The phone and console never see the AI key.
- The AI client is **OpenAI-compatible** (`/chat/completions`, `/audio/transcriptions`) with configurable `AI_BASE_URL`, so the user's key can be Groq, OpenAI, or another compatible provider. Default: `https://api.groq.com/openai/v1`.
- If the provider has no speech-to-text, `/v1/voice` still returns the deepfake score with `stt_ok=false`.
- Deepfake classifiers are **not** the AI provider. They run inside VIVEK on Modal.
- Backup compute (no Modal): the same VIVEK app runs on the laptop with `uvicorn` + a Cloudflare quick tunnel (Section 18).

---

## 5. REPO LAYOUT

```
satya/
  SATYA_ARCHITECTURE.md        <- this file
  BUILD_LOG.md                 <- gate results (Appendix G)
  .gitignore                   <- must ignore: keys/, **/.env*, android/secrets.properties, **/node_modules, **/build, .vercel
  design/                      <- user's design files (read-only input)
    INVENTORY.md               <- written in Phase 0
  spec/                        <- shared truth for all languages
    satya_bank_promises.json   <- the Promise Registry (from the project)
    rule_cases.json            <- Appendix A
    mask_vectors.json          <- Appendix B
    hash_vectors.json          <- Appendix C
    crypto_vectors.json        <- Appendix D
    paycheck_cases.json        <- Appendix E
    reference/                 <- Appendix F (Python oracles)
      rules_ref.py
      mask_ref.py
      pay_ref.py
  keys/                        <- generated, NEVER committed
    root.json                  <- SATYA Root key (offline)
    server.json                <- Receipt + Doctor keys
    demo_keys.json             <- bank private keys for console import
  supabase/
    schema.sql                 <- Section 12
    cron.sql                   <- Section 12.6
  web/                         <- Next.js: console (NYAYA) + gateway API
    app/(console)/...          <- pages
    app/api/v1/...             <- route handlers
    lib/satya/                 <- normalize, hash, mask, rules (TS port), crypto, bundle, paycheck
    lib/supabase/              <- clients (browser, service)
    scripts/                   <- gen-keys.ts, seed.ts, doctor.ts
    tests/                     <- vitest: spec vectors
  vivek/                       <- Python: FastAPI + Modal
    app.py  ai_client.py  scoring.py  masker.py  audio.py  modal_app.py
    models.json                <- chosen model IDs + fake labels + thresholds
    eval/eval_models.py  eval/samples/{real,fake}/
    tests/
    requirements.txt  .env.example  run_local.sh
  android/
    settings.gradle.kts  build.gradle.kts  gradle/libs.versions.toml
    secrets.properties         <- NOT committed (Section 6.3)
    core/                      <- pure Kotlin/JVM: normalize, hash, mask, entities, rules, router, models
    app/                       <- the SATYA Android app
    fakekyc/                   <- tiny fake "SBI KYC Update (DEMO)" app for the Know Your App demo
  setu/                        <- Cloudflare Worker (P2)
```

---

## 6. SECRETS AND CONFIG

### 6.1 Vercel (`web/.env.local` for local dev, Vercel env for prod)

| Name | Value | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret / service_role key | **No** |
| `SATYA_APP_KEY` | Random 32-byte hex, shared with phone + VIVEK | **No** |
| `SATYA_RECEIPT_SK` | Ed25519 secret key, 64-byte hex (libsodium format seed‖pk) | **No** |
| `SATYA_RECEIPT_PK` | 32-byte hex | Yes (also pinned in app) |
| `SATYA_ROOT_PK` | 32-byte hex | Yes |
| `SATYA_DOCTOR_BOX_SK` / `SATYA_DOCTOR_BOX_PK` | X25519 hex | SK: **No** |
| `VIVEK_URL` | Modal URL (or tunnel URL) | **No** |

All API routes that use `process.env` secrets must start with:
```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

### 6.2 Modal secret `satya-vivek` (and `vivek/.env` for local)

| Name | Default |
|---|---|
| `SATYA_APP_KEY` | same as Vercel |
| `AI_API_KEY` | **from the user** |
| `AI_BASE_URL` | `https://satya-ai.<account>.workers.dev/v1` (v1.1: SATYA's own Cloudflare Workers AI gateway, Qwen + Whisper, free tier). Any OpenAI-compatible URL works, e.g. `https://api.groq.com/openai/v1` |
| `AI_CHAT_MODEL` | a current JSON-capable chat model from `GET {AI_BASE_URL}/models` (choose in Phase 4) |
| `AI_STT_MODEL` | `@cf/openai/whisper-large-v3-turbo` on satya-ai, `whisper-large-v3-turbo` on Groq, else provider's STT model or empty |

### 6.3 Android `android/secrets.properties` (read into `BuildConfig`)

```
GATEWAY_URL=https://<vercel-app>.vercel.app
VIVEK_URL=https://<workspace>--satya-vivek-web.modal.run
APP_KEY=<same as SATYA_APP_KEY>
ROOT_PK=<hex>
RECEIPT_PK=<hex>
DOCTOR_BOX_PK=<hex>
```
`app/build.gradle.kts` must set `buildFeatures { buildConfig = true }` (AGP 8 default is false). URLs can also be overridden at runtime from the Doctor screen (stored in DataStore) so a backup endpoint never needs a rebuild.

### 6.4 The AI key handoff (Phase 4 start)

Claude Code asks the user exactly this, once:
> "Phase 4 needs the AI model API key. Please paste: (1) API key, (2) base URL if not Groq, (3) any preferred chat model. If Groq, also turn on Zero Data Retention in Groq console → Data Controls."

Then: write it only to `vivek/.env` (gitignored) and `modal secret create satya-vivek ...`. Never echo it.

---

## 7. SHARED SPECS (identical in Kotlin, TypeScript, Python)

### 7.1 Encoding rules (prevents the most common cross-platform bugs)

- Hashes, public keys, secret keys, signatures, tickets, day tokens: **lowercase hex**.
- Sealed boxes: **standard base64 with padding**. In JS use `sodium.to_base64(x, sodium.base64_variants.ORIGINAL)` and `sodium.from_base64(s, sodium.base64_variants.ORIGINAL)`. libsodium-wrappers defaults to URL-safe without padding, which Kotlin's `java.util.Base64.getDecoder()` rejects.
- Text is UTF-8 everywhere.
- **Sign exact bytes.** Signed JSON (Promise Cards) is stored and transported as a **string** (`card_json`). Verify the signature over those exact UTF-8 bytes **before** parsing. Never re-serialize and re-verify.
- Times: ISO 8601 UTC with `Z` (`new Date().toISOString()` style).

### 7.2 Normalization + hashing (SANGH, Kill, Pay Check)

`hash = sha256_hex(utf8(canonical))`, `prefix = hash[0:5]`.

| Type | Canonical form | Rule |
|---|---|---|
| `upi` | `upi:` + lowercase, trimmed | `SBI.KYC@YBL ` → `upi:sbi.kyc@ybl` |
| `tel` | `tel:` + digits only; if 12 digits starting `91` drop `91`; if 11 digits starting `0` drop `0` | `+91 70123 45645` → `tel:7012345645`; `1800-1800` → `tel:18001800` |
| `host` | `host:` + lowercase hostname, strip `www.`, **no scheme, path, query or port** (paths can carry the user's tokens) | `https://WWW.SBI-KYC-update.in/verify?id=9` → `host:sbi-kyc-update.in` |
| `app` | `app:` + signing certificate SHA-256 lowercase hex | `app:3f...` |
| `acct` | `acct:` + account digits + `:` + IFSC uppercase | `acct:50100123456780:HDFC0001234` |

Test vectors: Appendix C. Day token: `hmac_sha256_hex(key = install_secret_bytes, msg = utf8("YYYY-MM-DD|" + hash))`. Ticket hash: `sha256_hex(utf8(ticket_hex))`.

### 7.3 KAVACH masking (exact order matters)

Applied on the phone before any text leaves (`/v1/ask`, report payload), and again in VIVEK as defense in depth. Tokens: same value gets the same number, numbered by first appearance.

| Step | Regex (case notes) | Replacement |
|---|---|---|
| 1 Email | `[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+` | `[EMAIL]` |
| 2 UPI | `[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}\b` | `[UPI_n]` (key = lowercase value) |
| 3 Link | `(?i)\b(?:https?://)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:/[^\s]*)?` then strip trailing `.,;:!?)` back into the text | `[LINK_n]` |
| 4 Public bank numbers (KEEP, protect from later steps) | `(?<!\d)(?:1600\d{6}\|140\d{7}\|1800\d{4,7}\|1860\d{6,7})(?!\d)` | unchanged |
| 5 Card (Luhn-valid only) | `(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)` | `[CARD]` |
| 6 Aadhaar | `(?<!\d)(?:\d{4}\s\d{4}\s\d{4}\|\d{12})(?!\d)` | `[AADHAAR]` |
| 7 Phone | `(?:\+91[\s-]?\|(?<!\d)0)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)` | `[MY_PHONE]` if last 10 digits are the user's, else `[PHONE_n]` |
| 8 Account | `(?<!\d)\d{9,18}(?!\d)` | `[ACCOUNT]` |
| 9 PAN | `\b[A-Z]{5}[0-9]{4}[A-Z]\b` | `[PAN]` |
| 10 IFSC | `\b[A-Z]{4}0[A-Z0-9]{6}\b` | `[IFSC]` |
| 11 Code (OTP etc.) | `(?<!\d)\d{4,8}(?!\d)`, **skip** if the 5 chars before end with `rs`, `rs.`, `₹`, `inr` (+ optional spaces) | `[CODE]` |
| 12 User's own names | each registered name (≥3 chars), case-insensitive whole word | `[NAME]` |

In this table `\|` is only Markdown escaping: the real regex uses a plain `|`. When in doubt, copy the regex from the oracle `spec/reference/mask_ref.py` (Appendix F.2), which is authoritative.

Notes: a Luhn-valid account number becomes `[CARD]`; that is acceptable (still masked). Amounts written as `Rs 10,000` survive (needed for context). Vectors: Appendix B. Oracle: `spec/reference/mask_ref.py`.

### 7.4 Crypto (libsodium everywhere)

| Platform | Library | Notes |
|---|---|---|
| Android | `com.goterl:lazysodium-android` (@aar) + `net.java.dev.jna:jna` (@aar) | Use the **Native** byte-array APIs (`cryptoBoxSeal`, `cryptoSignVerifyDetached`). The Lazy string APIs silently hex-encode. If R8 is on: `-keep class com.sun.jna.** { *; }` and `-keep class com.goterl.** { *; }` |
| Web (browser + Node routes) | `libsodium-wrappers` | Always `await sodium.ready`. If the ESM build fails to resolve `libsodium.mjs`, pin the previous patch version or import via `require` in Node routes |
| Python (scripts/tests only) | `PyNaCl` | Used only for vector generation and tests |

| Key | Type | Private part | Public part | Signs / opens |
|---|---|---|---|---|
| SATYA Root | Ed25519 | `keys/root.json` (laptop only) | pinned in app (`ROOT_PK`), Vercel env | bank certificates + starter cards |
| SATYA Receipt | Ed25519 | Vercel env | pinned in app (`RECEIPT_PK`) | report receipts, pay-check receipts, doctor receipts |
| Bank Sign | Ed25519 | `keys/demo_keys.json` → imported into console browser (IndexedDB) | in bank certificate | its Promise Card |
| Bank Box | X25519 | same as above | in bank certificate | opens sealed reports (browser only) |
| Doctor Box | X25519 | Vercel env | pinned in app | Doctor seal round-trip |

Signed message formats (UTF-8, `|` separated, exact):
- Bank certificate: `satya-cert-v1|{bank_id}|{sign_pk}|{box_pk}` (box_pk empty string if none), signed by Root.
- Report receipt: `satya-receipt-v1|{report_id}|{sealed_hash}|{received_at}`, signed by Receipt key.
- Pay-check receipt: `satya-paycheck-v1|{check_id}|{request_hash}|{decision}|{decided_at}`, signed by Receipt key.
- Doctor receipt: `satya-doctor-v1|{plaintext_sha256}`, signed by Receipt key.
- `sealed_hash = sha256_hex(sealed_bytes)` (bytes after base64 decode).

Deterministic vectors (Ed25519 signature, X25519 seed keypair): Appendix D.

---

## 8. THE 11 PROTOCOLS

Each protocol lists: job, where it lives, how it is built, and its **gate test**.

### 8.1 DRISHTI (sight): all inputs, phone

| Input | Mechanism | Output |
|---|---|---|
| Triple tap | `SatyaA11yService` draws an **edge strip** (`TYPE_ACCESSIBILITY_OVERLAY`, right edge, 18dp wide, 35% screen height, centered). 3 taps within 700 ms. Haptic tick | starts Circle to Check |
| Screen capture | `takeScreenshot(Display.DEFAULT_DISPLAY, executor, callback)` → `Bitmap.wrapHardwareBuffer(...)` → **`.copy(ARGB_8888, false)`** before ML Kit | `Bitmap` |
| Screen text | Walk `windows` (flagRetrieveInteractiveWindows) roots, collect `text`/`contentDescription` + bounds, skip SATYA's own package. If empty, OCR the screenshot (ML Kit Latin + Devanagari, bundled models) | `List<TextBlock(text, bounds)>` |
| WhatsApp live | Accessibility events `TYPE_WINDOW_CONTENT_CHANGED` from `com.whatsapp`, `com.whatsapp.w4b`; debounce 600 ms; LRU of 500 message hashes to process each message once; sender from toolbar title if it is number-like | `Capture(channel=whatsapp)` |
| SMS live | Manifest `SmsReceiver` for `SMS_RECEIVED` (permission `RECEIVE_SMS`); join multipart bodies | `Capture(channel=sms, sender=originatingAddress)` |
| Calls | `SatyaCallScreeningService` (role `ROLE_CALL_SCREENING` via `RoleManager`). **Always call `respondToCall(details, CallResponse.Builder().build())` immediately (never block or reject)**, then check async | `Capture(channel=call, sender=number)` |
| App installs | `PACKAGE_ADDED` receiver **registered dynamically inside the running accessibility service** (manifest receivers do not get it) + `getChangedPackages(seq)` fallback in `SyncWorker` | `NewApp(pkg)` |
| Share | `ShareActivity` for `ACTION_SEND` with `audio/*`, `image/*`, `text/plain` | `Capture(channel=voice or screen)` |
| Video mode | Dismiss overlay, wait 300 ms, take 5 screenshots **≥ 450 ms apart** (Android rate-limits screenshots), ML Kit face detection, crop largest face +20% margin, resize 224×224, JPEG q85 | `List<ByteArray>` |

Scoping: `onServiceConnected` immediately sets `serviceInfo.packageNames = BASE_WATCH + suspects` where `BASE_WATCH = [com.whatsapp, com.whatsapp.w4b]`. Events from other packages are also ignored in code. The edge strip and screenshots work everywhere regardless of scope.

**Capture order for Circle to Check: screenshot FIRST, then show the overlay** (overlays can appear in screenshots).

Gate (on device, Doctor D1 to D4): service connected, strip visible, screenshot thumbnail shown, OCR returns text from the thumbnail.

### 8.2 PRAHARI (guard): local judge, phone

Lives in `android/core` (pure Kotlin, JVM-testable) with thin Android wrappers in `app/prahari`.

**Rules engine** (`core/Rules.kt`): port of `spec/reference/rules_ref.py`. Implements all 11 check types from `satya_bank_promises.json`:

| Check type | Fires when (exact semantics in the oracle) | Needs claimed bank? |
|---|---|---|
| `ask_contains_any` | a secret term (or Hindi direct phrase) and a **non-negated ask verb within 6 tokens**. `pin` followed by `code` is ignored | No (global G01). Yes for bank extras (PNB02) |
| `link_host_suffix` | a link host not ending in `.bank.in` and not in bank's `extra_allowed_link_hosts`. Emails and UPI IDs are removed before link extraction | Yes |
| `caller_prefix` | channel `call` or `whatsapp`: sender is a plain Indian mobile → `high`; sender starts `1600` and sales words present → `medium` | Yes |
| `message_asks_callback_to_prefix` | call verb within 6 tokens of a number starting `1600` | Yes |
| `sms_sender_is_header` | channel `sms` and sender is **not** a header. Header regex: `^([A-Z]{2}-)?(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,11}(-[STPG])?$` (must contain a letter, otherwise plain numbers would pass) | Yes |
| `asks_install_any` | remote-access app name and a non-negated install verb within 6 tokens | No |
| `asks_transfer_with_phrase` | safe-account phrase and a non-negated transfer verb within 8 tokens | No |
| `kyc_request_with_link` | KYC term and at least one link | Yes (SBI) |
| `email_sender_domain_in` | channel `email` and sender domain not equal to / not a subdomain of allowed | Yes (AXIS) |
| `incoming_caller_in` | channel `call` and caller number in list (number itself implies the bank) | **No** |
| `asks_fee_with_phrase` (v1.1) | a fee phrase (`kyc fee`, `unblock fee`, ...) and a **non-negated pay verb within 6 tokens** (G08) | No |

Token rules: lowercase; tokens = `[a-z0-9ऀ-ॿ]+`; negation words within 3 tokens before a verb cancel it (`not, never, dont, don, mat, na, nahi, nahin, kabhi, नहीं, मत`). Word lists (verbs, sales, KYC terms, bank aliases, header codes) are defined once in the oracle; copy them exactly.

Claimed bank: first match of bank aliases in text; else derived from a sender header code; else `null` → Circle to Check shows a **bank picker chip**. Test data uses `x` as digit placeholders in numbers (`+91 98xxxxxx21`); `national()` treats `x` as a digit.

**Router** (`core/Router.kt`, pure): input `Capture` → output `Plan` = which checks run locally and which need the cloud.
1. Extract entities: UPI IDs, links (hosts), phone numbers, amounts, bank aliases.
2. Run rules → hits.
3. If text contains a money claim (`debited|credited|refund|deducted|charged|withdrawn` + amount) and trigger is user → Reality Check.
4. Herd lookup for every extracted UPI, tel, host (user trigger), or only for values in hits (background).
5. If no rule hit and the text contains an ask-like verb or a secret/money word → `/v1/ask` (masked). Background never calls `/v1/ask`.
6. Video mode → `/v1/face`. Shared audio → `/v1/voice`.

**AI-assisted mapping** (from `/v1/ask` `ask_type`, used only when rules found nothing for that promise): `share_secret→G01`, `remote_access→G06`, `move_money→G07`, `pay_fee→G08` (v1.1), `kyc_update` + link + SBI → `SBI01`, `sales_offer` + caller `1600` → `G03 (medium)`. AI-assisted hits are labeled "AI-assisted" in the receipt and **capped at High** severity.

**Reality Check** (`app/prahari/RealityCheck.kt`, needs `READ_SMS`): query `content://sms/inbox` for the last 48 h; candidates = sender matches the header regex (any bank, not only registry headers) AND body has a debit word AND the same amount (normalize `10,000` = `10000` = `10000.00`). Found → "A matching debit SMS exists from {sender} at {time}. Confirm with your bank's official helpline." Not found → **"No debit SMS for ₹{amount} found on this phone in the last 48 hours. Check your bank app before acting."** Never say "this claim is false". Nothing leaves the phone.

**Know Your App** (`app/prahari/KnowYourApp.kt`, needs `QUERY_ALL_PACKAGES`): for a new package read installer (`getInstallSourceInfo().installingPackageName`), signing cert SHA-256 (`GET_SIGNING_CERTIFICATES`), label. Suspect if label or package mentions a bank alias, `kyc`, `yono`, `bank` AND (package, cert) is not in that bank's `official_apps`. Suspect → notification + added to watch list → service `packageNames` updated. **Suspect Watch:** if a watched app's window shows `aadhaar|pan|upi pin|otp|kyc|debit card|cvv`, show the full-screen block overlay with "Not from {bank}", Report, Uninstall (`ACTION_DELETE`, permission `REQUEST_DELETE_PACKAGES`).

Gate: `./gradlew :core:test` passes Appendix A (17 cases) and Appendix B; Doctor D8 runs the same cases on device.

### 8.3 KAVACH (armour): the only exit, phone

- `kavach/Packets.kt`: `sealed class KavachPacket` with **internal** constructors: `SyncReq`, `HerdLookup(prefix)`, `HerdSighting(h, t, dayToken)`, `AskLabel(maskedText, hintBank)`, `FaceFrames(frames)`, `VoiceNote(bytes, mime)`, `Report(envelope)`, `StatusCheck(id, ticket)`, `DoctorSeal(sealedB64)`.
- `kavach/Kavach.kt` (factory): the only place that builds packets. It runs masking (7.3), validates sizes (frames ≤ 5 × 60 KB, voice ≤ 15 MB, ask text ≤ 4,000 chars, report ≤ 2 MB), hashes (7.2).
- `kavach/KavachClient.kt`: the single `OkHttpClient` (connect 5 s, read 25 s, call 30 s). Adds `X-Satya-App`. Every `send` writes an **egress event** to SAKSHI with a plain-words summary and the `checkId`. A static counter asserts one instance.
- Build-time guard (`scripts/check_one_door.sh`, run in Phase 6 gate): `grep -rn "OkHttpClient(" android/app/src/main | wc -l` must be `1`; no `HttpURLConnection`, no `URL(...).openConnection`.

Gate: Appendix B vectors pass in Kotlin, TS, Python; one-door script passes; Doctor D9, D10.

### 8.4 SAKSHI (witness): log, receipts, report builder, phone

Room DB `sakshi.db`:

| Table | Columns |
|---|---|
| `checks` | id, ts, trigger (`tap`, `background`, `share`, `call`, `install`), channel, source_pkg, claimed_bank, severity, rule_ids, receipt_json |
| `egress` | id, ts, check_id, protocol, destination, packet_type, bytes, summary |
| `reports` | local_id, check_id, report_id, ticket (secret, local only), bank_id, status, receipt_sig, created_at, updated_at |
| `watchlist` | pkg, reason, added_at |

Report builder: assembles the sealed payload (9.4). Screenshot is attached **only if the user ticks it**, with OCR boxes matching KAVACH PII patterns blacked out, max width 1080, JPEG q70. Complaint pack (P2): Android `PdfDocument` with the receipt contents + links to cybercrime.gov.in and Sanchar Saathi, plus "Call 1930" button when the user marks "I lost money".

Gate: Doctor D18 (DB writable), Privacy Log shows entries after D11 to D17.

### 8.5 DOOT (messenger): seal and deliver, phone → cloud

Phone: `doot/Sealer.kt` seals payload JSON bytes with the bank's `box_pk` (from the verified certificate) using `crypto_box_seal`. Envelope (9.3) sent via `KavachClient`. `ReportSendWorker` (WorkManager, exponential backoff) so a report queued offline is sent later ("Queued" status). Generates a 32-byte random ticket (hex), sends only `ticket_hash`. Verifies the receipt signature with `RECEIPT_PK`. Status polling on app open via `StatusCheck` with header `X-Satya-Ticket` (never in the URL).

Cloud (DOOT inbox): `POST /api/v1/reports` (10.3) validates, computes `sealed_hash`, signs the receipt, calls SQL `ingest_report(...)` (atomic insert of report + blob + indicator counts).

Banks without a `box_pk` in their certificate: "Send to bank" disabled; complaint pack still available; herd sighting still recorded.

Gate: Doctor C4 (CLI round trip with Doctor keys) and D12/D13 (device seal opened by gateway, receipt verified).

### 8.6 SETU (bridge): optional relay

Cloudflare Worker: routes `/api/*` → `GATEWAY_URL`, `/vivek/*` → `VIVEK_URL`. Forwards only `content-type`, `x-satya-app`, `x-satya-ticket`, `authorization`. Strips `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `user-agent`, cookies. Never logs bodies. Phone switches by changing both base URLs (Doctor override). Honest framing: in the demo we run both relay and cloud; in production a third party runs the relay.

Gate: Doctor C12 through the worker URL.

### 8.7 VACHAN (promise): registry, cloud → phone

`GET /api/v1/registry` returns the **Registry Bundle** (9.2): GLOBAL card + each bank's certificate and card + blocklist. Phone verification order: `cert_sig` with pinned `ROOT_PK` → card `sig` with `cert.sign_pk` (or `ROOT_PK` when `signed_by = satya_root`). Invalid card → ignored, last good cache kept, Doctor shows it. First install works offline from `android/app/src/main/assets/registry_bundle.json` (written by `seed.ts`). `SyncWorker` runs every 15 min (Android minimum) + on app open.

Gate: Doctor C2 (6 cards verify against Root) and D7 on device.

### 8.8 SANGH (collective): Herd Signal, cloud

- `GET /api/v1/herd/{prefix}` (5 hex) → all matches for that prefix with `seen_7d`, `reports`, `confirmed_by`, `label`. The phone picks its own hash locally (k-anonymity).
- `POST /api/v1/herd/sighting` → `{h, t, day_token}`. Idempotent per (hash, day_token).
- Sightings are recorded only for values the user checked (triple tap/share) or values already flagged by rules. Never for unflagged background values.
- **The "instant block" on Phone B comes from this live lookup**, not from the 15-minute sync.

Gate: Doctor C3 (sighting then lookup shows seen ≥ 1), C7 (kill then lookup shows confirmed).

### 8.9 VIVEK (judgement): AI + deepfake, cloud (Modal)

Endpoints in Section 11. Implementation rules:
- Read bodies with `await request.body()` into memory. **Never use `UploadFile`** (it spools files over 1 MB to disk).
- Audio decode with PyAV from `io.BytesIO` → mono float32 16 kHz, first 30 s. For STT, re-encode to WAV in memory (Python `wave` module) and send as `audio.wav` (avoids `.opus`/codec surprises).
- Face: OpenCV Haar cascade (`cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'`) finds the largest face (+20% margin), else center crop. Resize 224.
- Deepfake models: Hugging Face `transformers.pipeline("audio-classification" | "image-classification", model=ID)` with IDs, `fake_labels` and `threshold` from `vivek/models.json`. Models are downloaded **at image build time** (no download on cold start).
- AI client (`ai_client.py`): `httpx` to `{AI_BASE_URL}/chat/completions` (temperature 0, `response_format: {"type":"json_object"}`, max_tokens 200, timeout 8 s) and `{AI_BASE_URL}/audio/transcriptions` (multipart, timeout 20 s). Server-side re-mask (`masker.py`, same 7.3 spec) before every chat call. One retry on 429/5xx, then fallback.
- Logging: one line per request: route, status, duration ms. Nothing else.
- Every endpoint degrades instead of failing: AI down → `ask_type: "unknown"`; STT down → `stt_ok: false`; model missing → `score: null`.

Gate: Doctor C8 + C9 + C10; `pytest vivek/tests` passes; `eval/eval_models.py` report saved to `BUILD_LOG.md`.

### 8.10 VISMRITI (forgetting): cloud deletion rules

| Data | Stored? | Retention | Readable by |
|---|---|---|---|
| Masked text, frames, audio, transcripts | **No** (RAM only) | seconds | nobody after the response |
| Sealed report blob | yes (`report_blobs`) | until report `closed_at` + 30 days (pg_cron) | only the bank's browser |
| Report tags (bank, channel, rules, indicator hashes, hour) | yes | kept | that bank's members |
| Ticket | hash only | with report | nobody can reverse |
| Sightings day tokens | yes | 30 days (pg_cron) | service only |
| Indicator counts / confirmed flags | yes | kept (scam data) | via herd lookup |
| Request logs | route + status + ms only | platform default | team |
| Pay Check files | **never uploaded** (browser only), except voice notes processed in RAM by VIVEK | n/a | company |

Phone users have no account, no device ID, no location. A report contains no user identity; the user may opt in to add a callback number **inside** the sealed box.

Gate: Doctor C10 (VIVEK temp-file count unchanged after requests), C11 (cron jobs present).

### 8.11 NYAYA (justice): console, browser + Vercel

Next.js App Router, TypeScript, Tailwind, styled from `design/`. Console users log in with Supabase Auth (email + password, seeded). Pages and flows in Section 14. Sealed reports are opened **in the browser** with the bank's Box key from IndexedDB (`idb-keyval`); keys are imported once from `keys/demo_keys.json` on the Keys page.

Gate: Doctor C5 (RLS), C6 (Realtime), and the Phase 5 E2E gate.

---

## 9. DATA CONTRACTS

### 9.1 Promise Card (`card_json` string content)

Bank card (built by `seed.ts` from `spec/satya_bank_promises.json`; the `promises` array copies the spec's `extra_promises` objects unchanged):
```json
{
  "v": 1,
  "bank_id": "SBI",
  "name": "State Bank of India",
  "issued_at": "2026-10-24T00:00:00.000Z",
  "web_domains": ["sbi.bank.in", "onlinesbi.sbi.bank.in"],
  "extra_allowed_link_hosts": [],
  "email_domains": ["sbi.co.in"],
  "email_senders": [],
  "sms_headers": ["SBIINB", "SBIPSG", "SBICRD"],
  "service_1600": ["1600108333"],
  "promo_140": ["1409768333"],
  "inbound_helplines": ["18001234", "18002100", "1800112211", "18004253800"],
  "official_apps": [{ "name": "YONO SBI", "package": null, "cert_sha256": null }],
  "promises": [ { "id": "SBI01_NO_KYC_LINKS", "promise": "...", "check": { "type": "kyc_request_with_link" }, "if_broken": "critical", "source": "...", "verified": false } ],
  "report_to": null
}
```
GLOBAL card: `{"v":1,"bank_id":"GLOBAL","issued_at":"...","promises":[...global_promises...],"report_channels":[...report_channels_india...],"upi_apps":[...upi_apps...]}` (`upi_apps` added in v1.1 for Know Your App). Promise objects may carry `promise_hi` (Hindi text) and `kill_chain_stage` (1 Contact, 2 Ask, 3 OTP, 4 Drain).
`official_apps[].package` and `cert_sha256` are filled in Phase 7 from real installs using Doctor → "Export finance app fingerprints".

### 9.2 Registry Bundle (`GET /api/v1/registry`, also `assets/registry_bundle.json`)

```json
{
  "v": 1,
  "generated_at": "2026-10-24T06:00:00.000Z",
  "global": { "card_json": "<string>", "sig": "<hex128>", "signed_by": "satya_root" },
  "banks": [
    {
      "bank_id": "SBI",
      "name": "State Bank of India",
      "cert": { "sign_pk": "<hex64>", "box_pk": "<hex64 or empty>", "cert_sig": "<hex128>" },
      "card": { "card_json": "<string>", "sig": "<hex128>", "signed_by": "bank | satya_root", "version": 1 }
    }
  ],
  "blocklist": [ { "h": "<hex64>", "t": "upi|tel|host|app", "by": "SBI", "label": "UPI sbi.k***@ybl" } ]
}
```

### 9.3 Report envelope (`POST /api/v1/reports`, plain JSON)

```json
{
  "v": 1,
  "bank_id": "SBI",
  "channel": "sms|call|whatsapp|email|screen|video|voice|app",
  "rules": ["G02_LINK_BANK_IN", "SBI01_NO_KYC_LINKS"],
  "severity": "critical|high|medium|none",
  "indicators": [ { "t": "upi|tel|host|app", "h": "<hex64>" } ],
  "hour": "2026-10-24T11",
  "sealed": "<standard base64>",
  "ticket_hash": "<hex64>"
}
```
Limits: `indicators` ≤ 20, `rules` ≤ 20 items matching `^[A-Z0-9_]{3,64}$`, decoded `sealed` ≤ 2 MB.

### 9.4 Sealed payload (plaintext inside the box, JSON UTF-8)

```json
{
  "v": 1,
  "created_at": "2026-10-24T11:42:10.120Z",
  "source_app": "com.google.android.apps.messaging",
  "channel": "sms",
  "claimed_bank": "SBI",
  "sender": "+91 98xxxxxx21",
  "masked_text": "Dear [NAME] ... [LINK_1]",
  "raw_indicators": [ { "t": "host", "value": "sbi-kyc-update.in" } ],
  "rule_hits": [ { "id": "SBI01_NO_KYC_LINKS", "severity": "critical", "promise": "...", "issuer": "SBI", "source": "...", "ai_assisted": false } ],
  "scores": { "face": null, "voice": null },
  "herd": { "seen_7d": 37, "reports": 4 },
  "timeline": [ { "t": "2026-10-24T11:41:58.000Z", "event": "SMS received from +91 98xxxxxx21" } ],
  "screenshot_jpeg_b64": null,
  "callback_number": null
}
```
`raw_indicators` are the **scammer's** values (needed by the bank). The user's own data is masked.

### 9.5 Proof Receipt (phone UI model, stored in `checks.receipt_json`)

Fields: `check_id`, `trigger`, `channel`, `claimed_bank`, `asked_for` (ask type in words), `kill_chain_stage` (max of the hits' `kill_chain_stage`, v1.1), `verdict` (`breaks` when any hit; `keeps` when no hit and a positive match exists: registered SMS header, official link host, or official number of the claimed bank; else `unknown`). Verdict words: **Breaks promise / Keeps promise / Unknown**; `keeps` always carries the line "This does not prove it is safe." `hits[]` (id, severity, promise text, issuer, source URL, ai_assisted), `overall` (`critical|high|medium|none`), `herd` (seen_7d, reports, confirmed_by), `reality` (`found|not_found|skipped` + message), `deepfake` (`face`/`voice` score or null + "signal, not proof" note), `left_phone[]` (from egress), `actions` (report, complaint pack, call 1930). When `overall = none`: "No broken promise found. This does not prove it is safe."

---

## 10. GATEWAY API (Vercel, Next.js route handlers under `web/app/api/v1/`)

Auth types: **App** = header `X-Satya-App: <SATYA_APP_KEY>`. **Console** = `Authorization: Bearer <supabase access token>`, verified with the service client `auth.getUser(token)` + membership check. Validate every body with **zod**. Errors: `{ "error": "<code>" }` with 400/401/403/404/413/500.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/health` | none | | `{ ok, db, vivek, version }` |
| GET | `/registry` | App | | Registry Bundle (9.2) |
| GET | `/herd/{prefix}` | App | prefix `^[0-9a-f]{5}$` | `{ matches: [{ h, t, seen_7d, reports, confirmed_by, label }] }` |
| POST | `/herd/sighting` | App | `{ h, t, day_token }` | `204` |
| POST | `/reports` | App | envelope (9.3) | `{ report_id, received_at, sealed_hash, receipt_sig }` |
| GET | `/reports/{id}/status` | App + header `X-Satya-Ticket` | | `{ status, updated_at }` (wrong ticket → 403) |
| POST | `/reports/{id}/opened` | Console | | `204` |
| POST | `/reports/{id}/dismiss` | Console | | `204` (sets `closed_at`) |
| POST | `/kill` | Console | `{ bank_id, indicators: [{ t, h, label }] }` | `{ blocked_reports }` |
| POST | `/cards` | Console | `{ bank_id, card_json, sig }` | `{ version }` (verifies sig with org `sign_pk`, `card_json.bank_id` must match) |
| POST | `/herd/counts` | Console | `{ hashes: [hex64] }` (≤ 200) | `{ [h]: { seen_7d, reports, confirmed_by } }` |
| POST | `/vivek/voice` | Console | raw audio body (≤ 4 MB, Vercel limit is 4.5 MB) | proxied VIVEK response |
| POST | `/vivek/face` | Console | `{ frames: [b64] }` | proxied VIVEK response |
| POST | `/paycheck/{id}/receipt` | Console | | `{ sig, receipt_pk, message }` (row must be decided) |
| POST | `/doctor/seal` | App | `{ sealed }` sealed to Doctor box | `{ ok, plaintext_sha256, sig }` |
| GET | `/doctor/echo-headers` | App | | which identifying headers reached the gateway (for SETU proof) |

Report ingest steps: validate → bank exists with `box_pk` → decode `sealed`, `sealed_hash = sha256_hex` → `report_id = crypto.randomUUID()`, `received_at = new Date().toISOString()` → sign receipt → `rpc('ingest_report', ...)` → respond.

Kill steps: verify membership in `bank_id` → `rpc('kill_indicators', ...)`. The browser sends **hashes and a masked label only** (e.g. `UPI sbi.k***@ybl`), never the raw value.

---

## 11. VIVEK API (Modal)

All requests require `X-Satya-App`. Size limits enforced before reading further.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | | `{ ok, models: { audio, face }, ai: { reachable, chat_model_ok, stt_model_ok }, tmp_files }` |
| POST | `/v1/ask` | `{ text, hint_bank }` (≤ 4,000 chars, already masked) | `{ ask_type, claimed_bank, urgency, confidence, source: "ai" or "fallback" }` |
| POST | `/v1/voice` | raw bytes, `Content-Type: audio/*` (≤ 15 MB) | `{ transcript, language, stt_ok, synthetic_score, threshold, model_id, ms }` |
| POST | `/v1/face` | `{ frames: [b64 jpeg] }` (≤ 5, each ≤ 300 KB) | `{ scores: [float], synthetic_score, faces_found, threshold, model_id, ms }` |

`ask_type` enum: `share_secret, remote_access, move_money, pay_fee, click_link, kyc_update, call_back, sales_offer, info_only, other, unknown`. `claimed_bank` enum: `SBI, HDFC, ICICI, AXIS, PNB, OTHER, NONE`. Invalid AI output → retry once → `unknown`. Prompt: Appendix H.

`vivek/models.json` shape:
```json
{
  "audio": { "task": "audio-classification", "id": null, "fake_labels": [], "threshold": 0.7, "eval": "" },
  "face":  { "task": "image-classification", "id": null, "fake_labels": [], "threshold": 0.7, "eval": "" }
}
```

### 11.1 Choosing the deepfake models (Phase 4, time-boxed to 60 minutes)

1. `eval/eval_models.py` lists candidates with `huggingface_hub.list_models(search=..., sort="downloads", limit=10)` for searches `deepfake audio`, `anti-spoofing`, `asvspoof` (task `audio-classification`) and `deepfake image`, `deepfake face` (task `image-classification`).
2. Skip any that fail to load on CPU or take > 3 s per item.
3. Print each model's labels. Set `fake_labels` explicitly (careful: in ASVspoof models `bonafide` means **real**, `spoof` means fake).
4. Score `eval/samples/{real,fake}/` (from H8). Pick the best with ≥ 7/10 correct. Save accuracy text in `models.json.eval`.
5. If none reaches 7/10: keep the best, show its score in the UI as "experimental signal", and rely on rules for the verdict. **Never block the demo on model accuracy.**

### 11.2 Modal deployment (`vivek/modal_app.py`)

```python
import os, json, pathlib, modal

app = modal.App("satya-vivek")

def download_models():
    import json
    from transformers import pipeline
    cfg = json.load(open("/root/models.json"))
    for k in ("audio", "face"):
        if cfg[k]["id"]:
            pipeline(cfg[k]["task"], model=cfg[k]["id"])  # caches into HF_HOME

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("transformers", "fastapi[standard]", "httpx", "numpy", "pillow", "av", "opencv-python-headless")
    .env({"HF_HOME": "/models"})
    .add_local_file("models.json", "/root/models.json", copy=True)
    .run_function(download_models)
    .add_local_python_source("app", "ai_client", "scoring", "masker", "audio")
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("satya-vivek")],
    cpu=2.0, memory=4096, timeout=120,
    min_containers=int(os.environ.get("SATYA_WARM", "0")),
    scaledown_window=600,
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    from app import create_app
    return create_app()
```
Deploy: `cd vivek && modal deploy modal_app.py`. Demo day: `SATYA_WARM=1 modal deploy modal_app.py`, then back to 0 after. If a Modal parameter name errors (Modal renames APIs over time), check Modal docs: older names were `keep_warm`, `container_idle_timeout`, `allow_concurrent_inputs`.

Local/backup: `vivek/run_local.sh` = `uvicorn app:create_app --factory --port 8000 --no-access-log` and `cloudflared tunnel --url http://localhost:8000` (prints an https `trycloudflare.com` URL; set it in Doctor overrides and in Vercel `VIVEK_URL`).

---

## 12. DATABASE (Supabase)

Apply with the **Session pooler** connection string (direct connections on the free tier are IPv6-only and often fail): `psql "$POOLER_URL" -f supabase/schema.sql`. Enable pg_cron in the Dashboard (H2) **before** running `cron.sql`.

### 12.1 Tables (`supabase/schema.sql`)

```sql
create extension if not exists pgcrypto;

create table public.orgs (
  id text primary key check (id ~ '^[A-Z0-9_]{2,16}$'),
  name text not null,
  type text not null check (type in ('bank','company')),
  sign_pk text check (sign_pk ~ '^[0-9a-f]{64}$'),
  box_pk text check (box_pk ~ '^[0-9a-f]{64}$'),
  cert_sig text check (cert_sig ~ '^[0-9a-f]{128}$'),
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id text not null references public.orgs(id) on delete cascade,
  primary key (user_id, org_id)
);

create table public.promise_cards (
  org_id text primary key,                         -- 'GLOBAL' or a bank org id
  card_json text not null,
  sig text not null check (sig ~ '^[0-9a-f]{128}$'),
  signed_by text not null check (signed_by in ('bank','satya_root')),
  version int not null default 1,
  published_at timestamptz not null default now()
);

create table public.indicators (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),
  type text not null check (type in ('upi','tel','host','app','acct')),
  reports int not null default 0,
  first_seen timestamptz not null default now(),
  confirmed_by text references public.orgs(id),
  confirmed_at timestamptz,
  label text
);

create table public.sightings (
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  type text not null check (type in ('upi','tel','host','app','acct')),
  day_token text not null check (day_token ~ '^[0-9a-f]{64}$'),
  day date not null default current_date,
  primary key (hash, day_token)
);
create index sightings_hash_day on public.sightings (hash, day);

create table public.reports (
  id uuid primary key,
  bank_id text not null references public.orgs(id),
  channel text not null check (channel in ('sms','call','whatsapp','email','screen','video','voice','app')),
  rules text[] not null,
  severity text not null check (severity in ('critical','high','medium','none')),
  indicator_hashes text[] not null default '{}',
  hour text not null check (hour ~ '^\d{4}-\d{2}-\d{2}T\d{2}$'),
  sealed_hash text not null check (sealed_hash ~ '^[0-9a-f]{64}$'),
  receipt_sig text not null,
  ticket_hash text not null check (ticket_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'delivered' check (status in ('delivered','opened','blocked','dismissed')),
  seeded boolean not null default false,
  received_at timestamptz not null,
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index reports_bank_time on public.reports (bank_id, received_at desc);
create index reports_hashes on public.reports using gin (indicator_hashes);

create table public.report_blobs (
  report_id uuid primary key references public.reports(id) on delete cascade,
  bank_id text not null,
  sealed text not null
);

create table public.pay_rules (
  org_id text primary key references public.orgs(id) on delete cascade,
  threshold_inr bigint not null default 100000,
  allowed_channels text[] not null default '{email,in_person}',
  updated_at timestamptz not null default now()
);

create table public.pay_vendors (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  vendor_name text not null,
  acct_hash text not null check (acct_hash ~ '^[0-9a-f]{64}$'),
  acct_hint text                                    -- last 4 digits only
);

create table public.pay_approvers (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  name text not null,
  role text not null,
  callback_phone text not null,
  max_amount_inr bigint not null
);

create table public.pay_checks (
  id uuid primary key default gen_random_uuid(),
  org_id text not null references public.orgs(id) on delete cascade,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  requester text,
  channel text not null,
  amount_inr bigint,
  flags jsonb not null default '[]',
  voice_score real,
  decision text not null check (decision in ('hold','clear','released','blocked')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  verify_result text check (verify_result in ('confirmed','denied')),
  decided_by uuid,
  decided_at timestamptz
);
```

### 12.2 RLS

```sql
create or replace function public.my_orgs() returns setof text
language sql stable security definer set search_path = public as $$
  select org_id from public.members where user_id = auth.uid()
$$;

alter table public.orgs          enable row level security;
alter table public.members       enable row level security;
alter table public.promise_cards enable row level security;
alter table public.indicators    enable row level security;
alter table public.sightings     enable row level security;
alter table public.reports       enable row level security;
alter table public.report_blobs  enable row level security;
alter table public.pay_rules     enable row level security;
alter table public.pay_vendors   enable row level security;
alter table public.pay_approvers enable row level security;
alter table public.pay_checks    enable row level security;

create policy members_self   on public.members      for select to authenticated using (user_id = auth.uid());
create policy orgs_member    on public.orgs         for select to authenticated using (id in (select public.my_orgs()));
create policy reports_member on public.reports      for select to authenticated using (bank_id in (select public.my_orgs()));
create policy blobs_member   on public.report_blobs for select to authenticated using (bank_id in (select public.my_orgs()));

create policy pay_rules_member     on public.pay_rules     for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_vendors_member   on public.pay_vendors   for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_approvers_member on public.pay_approvers for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
create policy pay_checks_member    on public.pay_checks    for all to authenticated using (org_id in (select public.my_orgs())) with check (org_id in (select public.my_orgs()));
-- promise_cards, indicators, sightings: no policies = service role only (gateway).
```

### 12.3 Functions (service role only)

```sql
create or replace function public.ingest_report(
  p_id uuid, p_bank text, p_channel text, p_rules text[], p_severity text,
  p_hashes text[], p_types text[], p_hour text, p_sealed text, p_sealed_hash text,
  p_receipt text, p_ticket_hash text, p_received_at timestamptz, p_seeded boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if coalesce(array_length(p_hashes,1),0) <> coalesce(array_length(p_types,1),0) then
    raise exception 'hashes/types length mismatch';
  end if;
  insert into reports (id, bank_id, channel, rules, severity, indicator_hashes, hour, sealed_hash,
                       receipt_sig, ticket_hash, received_at, seeded)
  values (p_id, p_bank, p_channel, p_rules, p_severity, p_hashes, p_hour, p_sealed_hash,
          p_receipt, p_ticket_hash, p_received_at, p_seeded);
  insert into report_blobs (report_id, bank_id, sealed) values (p_id, p_bank, p_sealed);
  for i in 1 .. coalesce(array_length(p_hashes,1),0) loop
    insert into indicators (hash, type, reports) values (p_hashes[i], p_types[i], 1)
    on conflict (hash) do update set reports = indicators.reports + 1;
  end loop;
end $$;

create or replace function public.herd_sight(p_hash text, p_type text, p_token text)
returns void language sql security definer set search_path = public as $$
  insert into sightings (hash, type, day_token) values (p_hash, p_type, p_token)
  on conflict do nothing;
$$;

create or replace function public.herd_lookup(p_prefix text)
returns table (hash text, type text, seen_7d bigint, reports int, confirmed_by text, label text)
language sql stable security definer set search_path = public as $$
  with s as (
    select sg.hash, min(sg.type) as type, count(*) as seen_7d
    from sightings sg
    where p_prefix ~ '^[0-9a-f]{5}$' and sg.hash like p_prefix || '%' and sg.day >= current_date - 7
    group by sg.hash),
  i as (
    select ind.* from indicators ind
    where p_prefix ~ '^[0-9a-f]{5}$' and ind.hash like p_prefix || '%')
  select coalesce(i.hash, s.hash), coalesce(i.type, s.type), coalesce(s.seen_7d, 0),
         coalesce(i.reports, 0), i.confirmed_by, i.label
  from i full outer join s on i.hash = s.hash;
$$;

create or replace function public.kill_indicators(p_bank text, p_hashes text[], p_types text[], p_labels text[])
returns int language plpgsql security definer set search_path = public as $$
declare i int; n int;
begin
  for i in 1 .. coalesce(array_length(p_hashes,1),0) loop
    insert into indicators (hash, type, reports, confirmed_by, confirmed_at, label)
    values (p_hashes[i], p_types[i], 0, p_bank, now(), p_labels[i])
    on conflict (hash) do update
      set confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at, label = excluded.label;
  end loop;
  update reports set status = 'blocked', closed_at = now(), updated_at = now()
   where bank_id = p_bank and indicator_hashes && p_hashes and status <> 'blocked';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.ingest_report(uuid,text,text,text[],text,text[],text[],text,text,text,text,text,timestamptz,boolean) from public, anon, authenticated;
revoke execute on function public.herd_sight(text,text,text) from public, anon, authenticated;
revoke execute on function public.herd_lookup(text) from public, anon, authenticated;
revoke execute on function public.kill_indicators(text,text[],text[],text[]) from public, anon, authenticated;
```
Supabase exposes `public` functions to `anon` by default. The `revoke` lines are mandatory; Doctor C5 checks that anon cannot call them.

### 12.4 Realtime

```sql
alter publication supabase_realtime add table public.reports;
```
Only the light `reports` row rides Realtime. The sealed blob lives in `report_blobs` (not published) so large payloads never hit Realtime limits.

### 12.5 Doctor helper (in `cron.sql`, after pg_cron is enabled)

```sql
create or replace function public.doctor_info() returns json
language sql stable security definer set search_path = public, cron as $$
  select json_build_object(
    'cron_jobs', (select coalesce(json_agg(jobname), '[]'::json) from cron.job),
    'realtime_tables', (select coalesce(json_agg(tablename), '[]'::json)
                        from pg_publication_tables where pubname = 'supabase_realtime'));
$$;
revoke execute on function public.doctor_info() from public, anon, authenticated;
```

### 12.6 VISMRITI timers (`supabase/cron.sql`)

```sql
select cron.schedule('satya_purge_blobs', '17 * * * *',
  $$delete from public.report_blobs b using public.reports r
    where b.report_id = r.id and r.closed_at is not null and r.closed_at < now() - interval '30 days'$$);
select cron.schedule('satya_purge_sightings', '23 3 * * *',
  $$delete from public.sightings where day < current_date - 30$$);
```

### 12.7 Seed (`web/scripts/seed.ts`, run with `npx tsx scripts/seed.ts`)

1. Load or create `keys/root.json`; create `keys/server.json` (Receipt + Doctor keys); print the env lines for Vercel and `android/secrets.properties`.
2. Orgs: `SBI, HDFC, ICICI, AXIS, PNB` (bank, Sign + Box keys), `DOCTOR` (bank, keys = Doctor box + a sign key), `ACME` (company, no keys). Certificates signed by Root.
3. Promise cards: GLOBAL + 5 banks from `spec/satya_bank_promises.json`, `signed_by = satya_root`.
4. Users (Supabase admin API, `email_confirm: true`): `sbi@satya.demo`, `hdfc@...`, `icici@...`, `axis@...`, `pnb@...`, `doctor@...`, `acme@satya.demo`; password from env `DEMO_PASSWORD`. Members rows.
5. ACME pay data from Appendix E (`rules`): vendors hashed with 7.2, approvers, threshold, channels.
6. 20 seeded reports (`seeded = true`) sealed to the real bank keys, spread over the last 7 days, reusing 3 campaigns (same UPI / host / tel) so the Radar groups them.
7. Write `keys/demo_keys.json` (bank Sign + Box secret keys) and `android/app/src/main/assets/registry_bundle.json` (same builder function as `/registry`, in `web/lib/satya/bundle.ts`).
8. The script is idempotent (upserts). Re-running it must not duplicate data.

---

## 13. ANDROID APP

### 13.1 Modules and build

| Module | Type | Contents |
|---|---|---|
| `:core` | Kotlin JVM library | `Normalize`, `Hash`, `Mask`, `Entities`, `Rules`, `Router`, `Registry` models, `AskMapping` (Pay Check lives only in TS) |
| `:app` | Android application `app.satya` | services, UI, Room, WorkManager, crypto, KAVACH client |
| `:fakekyc` | Android application `com.demo.fakekyc` | label "SBI KYC Update (DEMO)": one screen with Aadhaar / PAN / UPI PIN fields, **no INTERNET permission, stores nothing**. Used only to demo Know Your App + Suspect Watch |

Do not use `in` as a package segment (Kotlin keyword). minSdk 30, targetSdk 35, compileSdk = latest installed (≥ 35). Kotlin 2.x, Compose BOM, Material 3, KSP for Room, kotlinx-serialization. Latest stable versions in `gradle/libs.versions.toml`.

`:core` tests read `spec/` via `systemProperty("spec.dir", rootProject.file("../spec").absolutePath)` in the test task.

Dependencies (`:app`): core-ktx, activity-compose, compose BOM + material3 + navigation-compose, lifecycle-runtime-compose, lifecycle-service, savedstate, room (runtime, ktx, compiler via KSP), work-runtime-ktx, datastore-preferences, okhttp, kotlinx-serialization-json, kotlinx-coroutines-android, lazysodium-android (@aar) + jna (@aar), mlkit text-recognition + text-recognition-devanagari + face-detection (bundled), and the animation runtime matching `design/` (e.g. lottie-compose for Lottie JSON).

### 13.2 Manifest essentials

Permissions: `INTERNET`, `RECEIVE_SMS`, `READ_SMS`, `POST_NOTIFICATIONS`, `QUERY_ALL_PACKAGES`, `REQUEST_DELETE_PACKAGES`.
Components:
- `SatyaA11yService` with `BIND_ACCESSIBILITY_SERVICE` and `res/xml/satya_a11y.xml`:
```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagRetrieveInteractiveWindows|flagReportViewIds|flagIncludeNotImportantViews"
    android:canRetrieveWindowContent="true"
    android:canTakeScreenshot="true"
    android:notificationTimeout="300"
    android:description="@string/a11y_description" />
```
- `SatyaCallScreeningService` with `BIND_SCREENING_SERVICE` and intent filter `android.telecom.CallScreeningService`.
- `SmsReceiver` (exported, `android.permission.BROADCAST_SMS`) for `android.provider.Telephony.SMS_RECEIVED`.
- `ShareActivity` with `ACTION_SEND` filters for `audio/*`, `image/*`, `text/plain`.
- `android:networkSecurityConfig="@xml/network_security_config"`: no cleartext except loopback (Section 21.13).

### 13.3 Package structure (`app/src/main/java/app/satya/`)

```
SatyaApp.kt                 init: sodium, registry cache, notification channels, WorkManager
config/Config.kt            BuildConfig + DataStore overrides (URLs)
crypto/Sodium.kt            seal, verify, sha256, hmac (Native byte APIs)
drishti/                    SatyaA11yService, EdgeStrip, CaptureEngine, FaceCropper, SmsReceiver,
                            SatyaCallScreeningService, ShareActivity, PackageWatcher
prahari/                    RealityCheck, KnowYourApp, SuspectWatch, CheckRunner (calls :core Router)
kavach/                     Packets, Kavach (factory), KavachClient
doot/                       Sealer, ReportSendWorker, StatusPoller
sakshi/                     SakshiDb (Room), Dao, PrivacyLog, ComplaintPdf
vachan/                     RegistryStore (verify + cache), SyncWorker
ui/theme/                   tokens from design/
ui/screens/                 Setup, Home, Checks, ReceiptDetail, Reports, Apps, PrivacyLog, Doctor
ui/overlay/                 OverlayHost, CircleOverlay, ReceiptSheet, Banner, BankPicker, SuspectBlock
```

### 13.4 Compose inside overlays (common crash)

A `ComposeView` added to `WindowManager` from a Service crashes without owners. `OverlayHost` must implement `LifecycleOwner`, `SavedStateRegistryOwner` and `ViewModelStoreOwner`, call `performRestore(null)` and move the lifecycle to `RESUMED`, and set them on the view with `setViewTreeLifecycleOwner`, `setViewTreeSavedStateRegistryOwner`, `setViewTreeViewModelStoreOwner` before `addView`. Window params: `TYPE_ACCESSIBILITY_OVERLAY`, `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_IN_SCREEN`, `PixelFormat.TRANSLUCENT`.

### 13.5 Feature flows

**U1 Circle to Check**
1. Triple tap edge strip → `CaptureEngine` takes the screenshot first, collects node text, notes `source_pkg`.
2. `CircleOverlay` shows the frozen screenshot. User circles a region (bounding box of the path) or taps **Whole screen** or **Video mode**.
3. Text = node texts whose bounds intersect the region, else OCR of the cropped region.
4. Channel from `source_pkg`: messaging apps → `sms`, WhatsApp → `whatsapp`, Gmail → `email`, dialer/in-call UI → `call` (number read from screen), else `screen`.
5. `Router` → rules, Reality Check (money claim), herd lookups (+ sightings), `/v1/ask` if needed, `/v1/face` in video mode.
6. No claimed bank but asks found → **BankPicker** chip ("Who do they say they are?") → re-run rules.
7. `ReceiptSheet` shows the Proof Receipt (9.5). Actions: **Report to {bank}**, **Complaint pack**, **I lost money** (shows Call 1930), **Done**.

**U2 Live Promise Check**: SMS receiver / WhatsApp events → rules locally → if hits: heads-up notification + Banner overlay (auto-dismiss 8 s, tap opens receipt). Herd lookup + sighting for flagged values only. No text leaves the phone.

**U3 Call Promise Check** (at ring, number only): `incoming_caller_in` across all banks (PNB toll-free calling out = Critical), `1600`/`1601` = "Registered bank service series", `140` = "Promotional series", blocklisted or herd-reported number = alert with counts. Plain mobile numbers: no alert at ring; the user can triple tap during the call and pick the claimed bank. Doctor has **Simulate call** (enter a number → same function), because caller ID cannot be spoofed on stage.

**U4 Know Your App + Suspect Watch**: as in 8.2. Demo with `:fakekyc` installed via `adb install` or sideloaded.

**U5 Voice Note Check**: share audio → confirm sheet ("This voice note will be sent for analysis and deleted after") → `/v1/voice` → rules on transcript (channel `voice`) → receipt with voice score.

**U6 Report**: receipt → Report → builder (9.4) → KAVACH mask → DOOT seal → `ReportSendWorker` → receipt verified → status timeline Sealed → Delivered → Opened → Blocked/Dismissed.

**U7 Privacy Log**: list of `egress` rows in plain words ("11:42 sent 5 characters of a fingerprint to SANGH"), plus Watch List with remove buttons.

**U8 Sync**: `SyncWorker` every 15 min + app open; verify + cache bundle.

### 13.6 Setup (first run)

1. What SATYA does (one screen). 2. Your name and your phone number(s): stored on the phone only, used by KAVACH masking. 3. Enable Accessibility (deep link `Settings.ACTION_ACCESSIBILITY_SETTINGS`; show the Android 13+ tip: App info → ⋮ → **Allow restricted settings** for sideloaded apps). 4. SMS permissions. 5. Call screening role. 6. Notifications. 7. "Try it": opens a sample message and asks for a triple tap.

### 13.7 Screens (for judges)

Home (protections on, today's checks, last receipts, big Check now), Checks (receipts list + detail), Reports (status timeline), Apps (finance apps: verified / unknown, owner, source), Privacy Log, Doctor (long-press the version label to open).

### 13.8 Design files

Phase 0 writes `design/INVENTORY.md`: every screen, overlay, component, color/typography token and animation file found in `design/`, mapped to the screens in 13.7 and overlays in 13.3. Tokens → `ui/theme`. Animations: use the runtime that matches the files (Lottie JSON → lottie-compose; otherwise Compose animation APIs following the specs). Anything without a design uses existing tokens and components. Severity always shown as a text label.

---

## 14. CONSOLE (NYAYA)

### 14.1 Auth and data access

- Browser Supabase client (anon key) for login, `select` on `reports`, `report_blobs`, `orgs`, and full CRUD on `pay_*` (RLS-protected), plus Realtime.
- Everything else goes through `/api/v1/*` with `Authorization: Bearer <access_token>`.
- Org mode from `orgs.type` of the user's membership: bank pages or company pages.

### 14.2 Bank pages

| Page | Feature | Behavior |
|---|---|---|
| `/radar` | I2 | Loads last 7 days of reports, subscribes to Realtime INSERT with filter `bank_id=eq.{org}`. **If the channel is not `SUBSCRIBED` within 5 s, poll every 5 s.** Groups reports by shared indicator hash into campaigns: count, last time, channels, top rules, `seen_7d` from `/herd/counts`, status. New reports animate in |
| `/case/[id]` | I3 | Fetch row + blob; open sealed box in the browser (`crypto_box_seal_open`); show sender, masked text, scammer indicators, broken promises with source links, scores, timeline, screenshot. Calls `/reports/{id}/opened`. Buttons: **Kill** (choose indicators), **Dismiss**. Missing keys → link to `/keys` |
| `/recheck` | I4 | Upload audio → `/vivek/voice`; video → extract 5 frames with `<video>` + canvas (512 px) → `/vivek/face`; image → `/vivek/face`. Shows score as a signal with the threshold |
| `/card` | I1 | Loads current card from `/registry`; form for domains, headers, numbers, helplines, never-ask list; **Sign & Publish** (Bank Sign key) → `/cards`; shows "Signature valid" by verifying locally |
| `/blocklist` | I5 view | Confirmed indicators for this bank: label, type, time |
| `/keys` | setup | Import `demo_keys.json`; stores only this org's keys in IndexedDB |

**Kill** (I5): browser hashes selected raw indicators (7.2), builds masked labels, `POST /kill`. Toast "Blocked for all SATYA users". Report status updates via Realtime.

### 14.3 Company pages

| Page | Feature | Behavior |
|---|---|---|
| `/pay/rules` | I6 | Vendors (name + account + IFSC → hashed in the browser; store `acct_hint` = last 4 digits), approvers (name, role, callback phone, max amount), threshold, allowed channels |
| `/pay/check` | I7 | Inputs: requester (approver dropdown or Other), channel (`email, in_person, whatsapp, call, voice_note`), paste text, upload PDF (pdf.js text), image (tesseract.js, eng + hin), voice note (→ `/vivek/voice`). Extract amount, accounts, IFSC. Run Pay Check (14.4). Save `pay_checks` row with `request_hash = sha256(file bytes or text)`. The file never leaves the browser except voice notes |
| `/pay/check/[id]` | I8 + I9 | HOLD → **Verify Before Release** panel: shows approver's saved callback number; buttons **Called: confirmed** → `released`, **Called: denied** → `blocked`; logs user + time. **Evidence PDF** (pdf-lib, in browser): request hash, flags with reasons, voice score, decision log, receipt signature from `/paycheck/{id}/receipt` |
| `/pay/history` | | List of checks with decision |

### 14.4 Pay Check rules (TS, port of `spec/reference/pay_ref.py`)

| Flag | Severity | Fires when |
|---|---|---|
| `NEW_ACCOUNT` | Critical | an extracted account + IFSC hash is not a saved vendor |
| `APPROVER_UNKNOWN` | High | requester not in approvers |
| `APPROVER_LIMIT` | High | amount > requester's `max_amount_inr` |
| `WRONG_CHANNEL` | High | channel not in `allowed_channels` |
| `OVER_LIMIT` | Medium | amount > `threshold_inr` |
| `URGENT_SECRET` | High | at least one urgency word and one secrecy word |
| `SYNTHETIC_VOICE` | High (signal) | voice score ≥ model threshold |
| `NO_ACCOUNT_FOUND` | Info | no account number in the request |

Amount parsing: `4.8 lakh` / `4.8L` = 480000, `crore`/`cr` × 10^7, `Rs 2,40,000` = 240000; if several, take the largest. Decision: any Critical/High → `hold`, else `clear`. Vectors: Appendix E.

### 14.5 Libraries

next, react, @supabase/supabase-js, libsodium-wrappers, zod, idb-keyval, pdf-lib, pdfjs-dist, tesseract.js, tailwindcss; dev: vitest, tsx, typescript.

### 14.6 Design

Use `design/` tokens and components (from `design/INVENTORY.md`). Two demo browser profiles: one logged in as `sbi@satya.demo`, one as `acme@satya.demo`.

---

## 15. END-TO-END SEQUENCES (what must happen on stage)

**A. Fake SBI SMS (T01), background**: Phone C sends T01 text from a normal number → `SmsReceiver` → rules: G02 + G05 + SBI01 → notification + banner within 2 s, no network except herd prefix lookup → SAKSHI logs.

**B. WhatsApp "safe account" (T04), triple tap**: triple tap → circle → receipt: G07 Critical + G03 High + herd counts → Report → console Radar shows it live → analyst opens Case (decrypts in browser) → Kill → Phone B triple taps the same message → herd lookup says "Confirmed fake by ICICI".

**C. PNB spoof call (T03)**: Doctor → Simulate call `18001800` → Critical: "PNB toll-free numbers never make outgoing calls" (stated as simulated).

**D. Deepfake video**: play a deepfake clip on Phone A → triple tap → Video mode → face score + any on-screen ask.

**E. Company**: ACME console → Pay Check → upload fake CFO voice note (Appendix E P01 text) → flags NEW_ACCOUNT, WRONG_CHANNEL, OVER_LIMIT, URGENT_SECRET, SYNTHETIC_VOICE → HOLD → Verify Before Release → Called: denied → blocked → Evidence PDF.

---

## 16. BUILD PHASES AND GATES (total budget ≈ 12 h)

Parallel tracks are allowed after Phase 2 (separate Claude Code sessions): **Track W** (web + DB), **Track V** (VIVEK), **Track A** (Android). Each track still obeys its gates.

| Phase | Time | Build | GATE (must pass, record in BUILD_LOG.md) |
|---|---|---|---|
| **0 Scaffold** | 0:45 | Repo tree (Section 5), `.gitignore`, extract Appendices A to F into `spec/`, copy `satya_bank_promises.json`, write `design/INVENTORY.md`, ask the user for H1 to H4 and H6 to H8 in one message | `python3 spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json` → ALL PASS; `python3 spec/reference/mask_ref.py spec/mask_vectors.json` → ALL PASS; `python3 spec/reference/pay_ref.py spec/paycheck_cases.json` → ALL PASS |
| **1 Core logic** | 1:30 | `android/core` (Kotlin) and `web/lib/satya` (TS): normalize, hash, mask, entities, rules, router; pay-check in TS only; `vivek/masker.py` | `./gradlew :core:test` green; `npx vitest run` green; `pytest vivek/tests -k mask` green. All read `spec/` |
| **2 Database + seed** | 1:00 | `schema.sql`, `cron.sql`, `seed.ts`, `gen-keys.ts` | Seed prints 6 cards verified against Root; `doctor.ts --only db` passes C5 (RLS) and C11 (cron + realtime); re-running seed creates no duplicates |
| **3 Gateway** | 1:00 | all `/api/v1/*` except vivek proxies; deploy to Vercel | `doctor.ts --target local` then `--target prod`: C1, C2, C3, C4, C6, C7 PASS |
| **4 VIVEK + AI** | 1:30 | ask the user for the AI key (6.4); `app.py`, `ai_client.py`, `scoring.py`, `audio.py`; model eval (11.1); Modal deploy; Vercel vivek proxies | C8, C9, C10 PASS; eval report in BUILD_LOG.md |
| **5 Console** | 2:00 | pages 14.2 + 14.3 styled from `design/` | E2E: `doctor.ts --e2e` posts a Doctor report → appears in Radar within 5 s → decrypts → Kill → herd lookup confirmed; Pay Check P01/P02/P03 produce Appendix E results in the UI |
| **6 Android** | 3:00 | `:app` services, KAVACH, DOOT, SAKSHI, VACHAN, overlays, screens, Doctor screen, `:fakekyc` | `check_one_door.sh` PASS; Doctor screen D1 to D19 all PASS on Phone A and Phone B; Sequence A and B (Section 15) work end to end |
| **7 Hardening** | 1:15 | fallbacks (Section 18), official app fingerprints, SETU (P2), demo rehearsal x2 | Full Section 15 script runs twice in a row without touching code; Doctor all green after a phone reboot |

**Feature freeze at 10:45.** After freeze: only bug fixes that a Doctor check or the demo script exposes.

---

## 17. DOCTOR (protocol health checks)

### 17.1 CLI: `web/scripts/doctor.ts` (`npx tsx scripts/doctor.ts --target local|prod [--only <group>] [--e2e]`)

| ID | Protocol | Check |
|---|---|---|
| C1 | Gateway | `/health` ok, db ok |
| C2 | VACHAN | `/registry` cards: 1 GLOBAL + 5 banks; every cert verifies with `SATYA_ROOT_PK`; every card verifies; JSON parses after verify |
| C3 | SANGH | random hash: sighting → lookup by prefix shows it with `seen_7d ≥ 1`; same token twice counts once |
| C4 | DOOT | seal a payload to the DOCTOR org box key → `POST /reports` → receipt verifies with `SATYA_RECEIPT_PK` → read blob with service client → open with Doctor box SK → payload identical; status with right ticket 200, wrong ticket 403 |
| C5 | RLS | as `sbi@` user: cannot select HDFC reports; anon: cannot select `reports`, cannot `rpc('herd_lookup')`, cannot `rpc('ingest_report')` |
| C6 | Realtime | as `doctor@` user, subscribe, post a report, event arrives ≤ 5 s |
| C7 | Kill | as `doctor@` user, kill a hash → herd lookup shows `confirmed_by = DOCTOR` |
| C8 | VIVEK | `/health` models loaded; `/v1/ask` on masked T02 text → `share_secret`; `/v1/voice` on `eval/samples` clip → transcript non-empty (if STT) + score; `/v1/face` on sample → score |
| C9 | AI model | `GET {AI_BASE_URL}/models` (via VIVEK health) lists `AI_CHAT_MODEL` and `AI_STT_MODEL` |
| C10 | VISMRITI | VIVEK `tmp_files` unchanged after C8; gateway response bodies never echo inputs |
| C11 | VISMRITI | `rpc('doctor_info')` lists `satya_purge_blobs`, `satya_purge_sightings` and realtime table `reports` |
| C12 | SETU (optional) | C1 + C3 through the worker URL; `/doctor/echo-headers` shows no client IP headers from the phone |

Output: a table of PASS/FAIL with one-line reasons; exit code 1 on any FAIL. Paste into BUILD_LOG.md.

### 17.2 On-device Doctor screen

| ID | Check |
|---|---|
| D1 | Accessibility service enabled and connected |
| D2 | Edge strip overlay visible |
| D3 | Screenshot works (thumbnail shown) |
| D4 | OCR returns text from the thumbnail |
| D5 | SMS permissions granted |
| D6 | Call screening role held |
| D7 | Registry verified: 6 cards, source (network or assets), age |
| D8 | Rules self-test: Appendix A cases run on device, all PASS |
| D9 | KAVACH self-test: Appendix B vectors, all PASS |
| D10 | One door: exactly 1 KavachClient instance |
| D11 | SANGH lookup round trip |
| D12 | DOOT seal test: seal "satya-doctor" to `DOCTOR_BOX_PK` → `/doctor/seal` opens it |
| D13 | Receipt signature from D12 verifies with `RECEIPT_PK`; Appendix D vector verifies |
| D14 | VIVEK health |
| D15 | VIVEK ask on masked T02 → `share_secret` |
| D16 | Face test with bundled sample image |
| D17 | Voice test with bundled sample clip |
| D18 | Room DB writable |
| D19 | SyncWorker scheduled |

Tools on the Doctor screen: **Simulate call** (number), **Inject SMS** (sender + text into the SMS pipeline), **Run T-cases**, **Override URLs** (gateway, VIVEK), **Export finance app fingerprints** (package + cert SHA-256 of installed finance apps, copy to clipboard).

---

## 18. FALLBACK LADDER (the prototype cannot fail)

| Failure | What still works | Switch |
|---|---|---|
| AI provider down / rate-limited | All rule-based verdicts; receipts say "AI label unavailable" | automatic (`source: fallback`) |
| VIVEK cold or down | Rules, herd, reports; receipt shows "Deepfake check unavailable" | Doctor shows; warm with `SATYA_WARM=1`; or laptop `run_local.sh` + tunnel + Doctor URL override + Vercel `VIVEK_URL` |
| Gateway down | Phone checks from cached registry (assets on first run); reports queue as "Queued" | WorkManager retries |
| Realtime not subscribing | Radar polls every 5 s | automatic |
| Venue Wi-Fi bad | Phones on a hotspot; all core checks are local | manual |
| Accessibility capture blocked by an app (secure window) | Share sheet → same check | user |
| Live call cannot show spoofed number | Doctor → Simulate call | presenter |
| Deepfake model weak | Score shown as "experimental signal"; verdict from rules | automatic |
| Console keys missing on demo laptop | `/keys` import from `keys/demo_keys.json` (keep a copy on a USB drive) | presenter |

---

## 19. DEMO KIT

- **Phone A** (demo), **Phone B** (instant-block proof), **Phone C** (teammate: sends SMS/WhatsApp, calls).
- Laptop: two browser profiles (SBI bank, ACME company), keys imported, Doctor CLI ready, `run_local.sh` ready as backup.
- Assets: deepfake clip in Phone A gallery; fake CFO voice note; text file with T01 and T04 messages for Phone C.
- **T-60 min**: `SATYA_WARM=1 modal deploy`; open Supabase dashboard (free projects pause after a week idle); `doctor.ts --target prod --e2e` all PASS; Doctor screen all green on A and B; hotspot on.
- **After the demo**: `modal deploy` with `SATYA_WARM=0`.

---

## 20. PITFALLS CHECKLIST (each one has bitten someone before)

1. Hash normalization differs between Kotlin and TS → Kill never matches. Fix: Appendix C tests in both.
2. libsodium-wrappers URL-safe base64 default → Kotlin decode fails. Fix: `base64_variants.ORIGINAL`.
3. Re-serializing signed JSON → signature fails. Fix: sign and verify the stored string.
4. Lazysodium Lazy APIs return hex strings → wrong bytes. Fix: Native APIs.
5. Genuine bank SMS "Do not share your OTP" flagged. Fix: negation + verb window (N01, N05).
6. "pin code" flagged as PIN. Fix: N02.
7. UPI ID `sbi.kyc@ybl` read as a link `sbi.kyc`. Fix: strip emails and UPI IDs before link extraction.
8. Plain numbers passing the header regex. Fix: header must contain a letter.
9. Test data uses `x` in phone numbers. Fix: `national()` treats `x` as a digit.
10. `takeScreenshot` hardware bitmap → ML Kit crash. Fix: `.copy(ARGB_8888, false)`.
11. Screenshots taken too fast → error. Fix: ≥ 450 ms between frames.
12. Overlay captured in the screenshot. Fix: screenshot before showing the overlay.
13. Compose overlay crash from a Service. Fix: 13.4 owners.
14. `PACKAGE_ADDED` not received. Fix: register inside the accessibility service.
15. Call screening blocks or delays calls. Fix: respond immediately, check async. Demo caller must not be in contacts.
16. Android 13+ blocks Accessibility for sideloaded apps. Fix: "Allow restricted settings".
17. `BuildConfig` missing. Fix: `buildFeatures { buildConfig = true }`.
18. FastAPI `UploadFile` writes to disk. Fix: `await request.body()`.
19. `.opus` voice notes rejected by STT. Fix: re-encode to WAV in memory.
20. Next.js caches GET routes. Fix: `dynamic = 'force-dynamic'`.
21. Supabase functions callable by anon. Fix: revoke lines in 12.3.
22. Supabase direct DB connection fails (IPv6). Fix: Session pooler string.
23. Large sealed blobs in Realtime. Fix: separate `report_blobs` table.
24. RLS policy subquery on `members` recursion/denial. Fix: `my_orgs()` security definer.
25. Free tiers asleep on stage. Fix: Section 19 T-60 checklist.
26. ASVspoof labels: `bonafide` = real. Fix: explicit `fake_labels` in `models.json`.
27. Reality Check accusing a real debit of being fake. Fix: search all DLT headers; soft wording.
28. Ticket in URL ends up in logs. Fix: `X-Satya-Ticket` header.

---

## APPENDIX A: `spec/rule_cases.json`

`expected` lists rule IDs; `severity` gives the expected severity per ID. `claims` is the expected detected bank (`null` = none).

```json
{
  "cases": [
    {"id":"T01","channel":"sms","sender":"+91 98xxxxxx21","text":"Dear SBI customer your YONO will be blocked today. Update PAN KYC: sbi-kyc-update.in/verify","claims":"SBI","expected":["G02_LINK_BANK_IN","G05_SMS_FROM_HEADER_NOT_NUMBER","SBI01_NO_KYC_LINKS"],"severity":{"G02_LINK_BANK_IN":"high","G05_SMS_FROM_HEADER_NOT_NUMBER":"high","SBI01_NO_KYC_LINKS":"critical"}},
    {"id":"T02","channel":"call","sender":"+91 70xxxxxx45","text":"Main HDFC Bank se bol raha hoon, aapke card pe fraud hua hai, jo OTP aaya hai woh bata dijiye","claims":"HDFC","expected":["G01_NO_SECRETS","G03_SERVICE_CALLS_1600"],"severity":{"G01_NO_SECRETS":"critical","G03_SERVICE_CALLS_1600":"high"}},
    {"id":"T03","channel":"call","sender":"18001800","text":"This is PNB head office. Your account is under RBI audit. Install AnyDesk so our officer can secure it.","claims":"PNB","expected":["G06_NO_REMOTE_ACCESS","PNB01_TOLLFREE_NEVER_CALLS_OUT"],"severity":{"G06_NO_REMOTE_ACCESS":"critical","PNB01_TOLLFREE_NEVER_CALLS_OUT":"critical"}},
    {"id":"T04","channel":"whatsapp","sender":"+91 63xxxxxx09","text":"ICICI fraud team: suspicious activity found. Move your balance to this safe account for 24 hours. A/c 50xxxxxxxx","claims":"ICICI","expected":["G03_SERVICE_CALLS_1600","G07_NO_SAFE_ACCOUNT"],"severity":{"G03_SERVICE_CALLS_1600":"high","G07_NO_SAFE_ACCOUNT":"critical"}},
    {"id":"T05","channel":"email","sender":"alerts@axisbank-support.com","text":"Your Axis net banking is suspended. Login at axis-secure-login.com to restore.","claims":"AXIS","expected":["AXIS_EMAIL_SENDER_MISMATCH","G02_LINK_BANK_IN"],"severity":{"AXIS_EMAIL_SENDER_MISMATCH":"high","G02_LINK_BANK_IN":"high"}},
    {"id":"T06","channel":"sms","sender":"VM-HDFCBK-S","text":"Rs 2,450 debited from a/c **1234 on 24-10-26. Not you? Call 18002026161","claims":"HDFC","expected":[],"severity":{}},
    {"id":"T07","channel":"call","sender":"1600108333","text":"SBI calling to confirm a transaction of Rs 10,000 at an online store. Press 1 if this was you.","claims":"SBI","expected":[],"severity":{}},
    {"id":"T08","channel":"call","sender":"1600313900","text":"ICICI here. Special pre-approved personal loan offer at 9 percent, interested?","claims":"ICICI","expected":["G03_SERVICE_CALLS_1600"],"severity":{"G03_SERVICE_CALLS_1600":"medium"}},
    {"id":"N01","channel":"sms","sender":"AD-SBIINB-S","text":"482913 is OTP for your SBI txn of Rs 500. Do not share it with anyone. -SBI","claims":"SBI","expected":[],"severity":{}},
    {"id":"N02","channel":"whatsapp","sender":"+91 98xxxxxx77","text":"Please share your pin code for delivery","claims":null,"expected":[],"severity":{}},
    {"id":"N03","channel":"email","sender":"alerts@axis.bank.in","text":"Your Axis credit card statement is ready. Login at https://axis.bank.in to view.","claims":"AXIS","expected":[],"severity":{}},
    {"id":"N04","channel":"sms","sender":"+91 99xxxxxx12","text":"SBI se bol raha hu, OTP batao warna account band","claims":"SBI","expected":["G01_NO_SECRETS","G05_SMS_FROM_HEADER_NOT_NUMBER"],"severity":{"G01_NO_SECRETS":"critical","G05_SMS_FROM_HEADER_NOT_NUMBER":"high"}},
    {"id":"N05","channel":"sms","sender":"JD-HDFCBK","text":"Never share OTP, PIN or CVV with anyone. HDFC Bank never asks for it. Visit hdfc.bank.in","claims":"HDFC","expected":[],"severity":{}},
    {"id":"N06","channel":"sms","sender":"VM-HDFCBK","text":"Track your request at hdfcbk.io/a1B2c3","claims":"HDFC","expected":[],"severity":{}},
    {"id":"N07","channel":"whatsapp","sender":"+91 70xxxxxx45","text":"SBI: call us back on 1600108333 to unblock your account","claims":"SBI","expected":["G03_SERVICE_CALLS_1600","G04_1600_IS_OUTBOUND_ONLY"],"severity":{"G03_SERVICE_CALLS_1600":"high","G04_1600_IS_OUTBOUND_ONLY":"medium"}},
    {"id":"T09","channel":"whatsapp","sender":"+91 70448 21319","text":"Dear Ramesh, your YONO account will be blocked today because your KYC is pending. Pay ₹10 KYC fee to sbi.kyc@ybl to keep your account active. — SBI KYC Team","claims":"SBI","expected":["G03_SERVICE_CALLS_1600","G08_NO_KYC_FEE"],"severity":{"G03_SERVICE_CALLS_1600":"high","G08_NO_KYC_FEE":"high"}},
    {"id":"N08","channel":"sms","sender":"VM-SBIINB","text":"SBI never charges a KYC fee. Do not pay anyone who asks for one.","claims":"SBI","expected":[],"severity":{}}
  ]
}
```

## APPENDIX B: `spec/mask_vectors.json`

```json
{
  "vectors": [
    {"in":"Dear Ravi, OTP 482913 for a/c 50100123456780. Pay to sbi.kyc@ybl or visit sbi-kyc-update.in/verify. PAN ABCDE1234F","my_names":["Ravi"],"my_phones":["9876543210"],"out":"Dear [NAME], OTP [CODE] for a/c [ACCOUNT]. Pay to [UPI_1] or visit [LINK_1]. PAN [PAN]"},
    {"in":"Card 4111 1111 1111 1111 exp 12/27","my_names":[],"my_phones":[],"out":"Card [CARD] exp 12/27"},
    {"in":"Aadhaar 2345 6789 0123 linked","my_names":[],"my_phones":[],"out":"Aadhaar [AADHAAR] linked"},
    {"in":"Call +91 70123 45645 now, Rs 10,000 debited","my_names":[],"my_phones":["9876543210"],"out":"Call [PHONE_1] now, Rs 10,000 debited"},
    {"in":"My number is 9876543210, call me","my_names":[],"my_phones":["9876543210"],"out":"My number is [MY_PHONE], call me"},
    {"in":"Email a.b@gmail.com for refund of Rs 5000","my_names":[],"my_phones":[],"out":"Email [EMAIL] for refund of Rs 5000"},
    {"in":"Call 1600108333 or 18002026161","my_names":[],"my_phones":[],"out":"Call 1600108333 or 18002026161"},
    {"in":"IFSC HDFC0001234 a/c 50100123456780","my_names":[],"my_phones":[],"out":"IFSC [IFSC] a/c [ACCOUNT]"},
    {"in":"Pay sbi.kyc@ybl then pay sbi.kyc@ybl again, or hdfc.help@okaxis","my_names":[],"my_phones":[],"out":"Pay [UPI_1] then pay [UPI_1] again, or [UPI_2]"},
    {"in":"Visit https://WWW.SBI-KYC-update.in/verify?id=9.","my_names":[],"my_phones":[],"out":"Visit [LINK_1]."}
  ]
}
```

## APPENDIX C: `spec/hash_vectors.json`

```json
{
  "normalize_and_hash": [
    {"type":"upi","raw":"SBI.KYC@YBL ","canonical":"upi:sbi.kyc@ybl","sha256":"30207f98b7687faff18eca253dffbc6887e09c5922edfff80f120f6c03574740","prefix":"30207"},
    {"type":"tel","raw":"+91 70123 45645","canonical":"tel:7012345645","sha256":"1e163c27cfb761681f3e749648a9d253f0a6148690f6a230374217ae46fa3360","prefix":"1e163"},
    {"type":"tel","raw":"07012345645","canonical":"tel:7012345645","sha256":"1e163c27cfb761681f3e749648a9d253f0a6148690f6a230374217ae46fa3360","prefix":"1e163"},
    {"type":"tel","raw":"1800-1800","canonical":"tel:18001800","sha256":"4b5c14d85e8b3da73ca1028fd13235c3d3752f2ade305f3039240cd11ee9fabe","prefix":"4b5c1"},
    {"type":"tel","raw":"1600108333","canonical":"tel:1600108333","sha256":"9525d9a2aa64db29f7413a544066b420af3b06f3135350fc50fca7e348f675dc","prefix":"9525d"},
    {"type":"host","raw":"https://WWW.SBI-KYC-update.in/verify?id=9","canonical":"host:sbi-kyc-update.in","sha256":"6ba4fb66af2f6c8be4104e58fadfb7d8900b3406b9f5c762b8edf7bf2bb1558e","prefix":"6ba4f"},
    {"type":"host","raw":"axis-secure-login.com","canonical":"host:axis-secure-login.com","sha256":"ea08ead26c7bd0f3331c59a6f9f552e4efeb6669b358126f42d4d69792fbdf08","prefix":"ea08e"},
    {"type":"acct","raw":"50100123456780 / hdfc0001234","canonical":"acct:50100123456780:HDFC0001234","sha256":"83975d9a5b8ce7a8e626d5126fb02da68ec649f7e70cb94415ea1e160fdc9f28","prefix":"83975"},
    {"type":"acct","raw":"50100987654321 / HDFC0001234","canonical":"acct:50100987654321:HDFC0001234","sha256":"aaf5b6200bdeb934730290914795eb5d85e91522f14a650e0596183e07b5b5c0","prefix":"aaf5b"}
  ],
  "day_token": {"install_secret_hex":"0000000000000000000000000000000000000000000000000000000000000000","day":"2026-10-24","hash":"30207f98b7687faff18eca253dffbc6887e09c5922edfff80f120f6c03574740","token":"815a71e48091e5506c8fb36862ecddc39a64cc882ad25d316eee9a18d1cf6511"},
  "ticket": {"ticket":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","ticket_hash":"ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"}
}
```
For `acct`, the raw form in the vector is "account / ifsc"; the normalizer takes them as two fields.

## APPENDIX D: `spec/crypto_vectors.json`

Deterministic. Test keys only, never used in production.

```json
{
  "ed25519": {
    "seed_hex": "0101010101010101010101010101010101010101010101010101010101010101",
    "pk_hex": "8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
    "sk64_hex": "01010101010101010101010101010101010101010101010101010101010101018a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c",
    "message_utf8": "satya-test-v1",
    "signature_hex": "2c1fd041b01eeffa6b2c808d6715b2ab8915bddb6b3e6fba395bc9b0c43e90e150057f8410437915dd7f2111efdb3bea96935c9f9d16e5248311e0f8d99cbd02",
    "cert_message_utf8": "satya-cert-v1|SBI|8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c|",
    "cert_signature_hex": "70bdbcd9358eaa667683fabe604a13cf27e66bff5fa811393675e251397f959287d84cb899e741f7b25757373200a984f05b605383a835e2c5226efb629efd04"
  },
  "x25519_seed_keypair": {
    "seed_hex": "0202020202020202020202020202020202020202020202020202020202020202",
    "pk_hex": "60346e7c911a5f6ba154129174cafe75b294ac3bbd5549632f48cec6266f8410",
    "sk_hex": "aa3c626bc9c38c8c201878ebb1d5b0b50ac40e8986c78793db1d4ef369fca1ce"
  },
  "sealed_box": {
    "note": "Sealed boxes are randomized. Test = seal 'satya-doctor' to pk_hex above, open with sk_hex. Ciphertext length must be plaintext length + 48 (60 bytes for 'satya-doctor')."
  }
}
```
Tests in all three languages: signature verifies; signing the message with the seed reproduces the exact signature (Ed25519 is deterministic); `crypto_box_seed_keypair(seed)` reproduces pk/sk; seal/open round trip; length check.

## APPENDIX E: `spec/paycheck_cases.json`

```json
{
  "voice_threshold": 0.7,
  "rules": {
    "threshold_inr": 100000,
    "allowed_channels": ["email", "in_person"],
    "vendors": [{"vendor_name":"Sharma Traders","account":"50100987654321","ifsc":"HDFC0001234"}],
    "approvers": [
      {"name":"R. Mehta","role":"CFO","callback_phone":"+91 98xxxxxx10","max_amount_inr":500000},
      {"name":"A. Verma","role":"Accounts Manager","callback_phone":"+91 97xxxxxx22","max_amount_inr":100000}
    ]
  },
  "cases": [
    {"id":"P01","requester":"R. Mehta","channel":"voice_note","voice_score":0.87,"text":"This is Mehta. Transfer 4.8 lakh to account 50100123456780 IFSC HDFC0001234 urgently today. Keep it confidential, don't tell anyone.","expect_amount":480000,"expect_flags":["NEW_ACCOUNT","OVER_LIMIT","SYNTHETIC_VOICE","URGENT_SECRET","WRONG_CHANNEL"],"expect_decision":"hold"},
    {"id":"P02","requester":"A. Verma","channel":"email","voice_score":null,"text":"Please release Rs 45,000 to Sharma Traders a/c 50100987654321 IFSC HDFC0001234 for invoice 7781.","expect_amount":45000,"expect_flags":[],"expect_decision":"clear"},
    {"id":"P03","requester":"A. Verma","channel":"email","voice_score":null,"text":"Pay Rs 2,40,000 to Sharma Traders a/c 50100987654321 IFSC HDFC0001234.","expect_amount":240000,"expect_flags":["APPROVER_LIMIT","OVER_LIMIT"],"expect_decision":"hold"}
  ]
}
```

## APPENDIX F: REFERENCE IMPLEMENTATIONS (oracles, all verified passing)

### F.1 `spec/reference/rules_ref.py`

Usage: `python3 spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json`

```python
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
```

### F.2 `spec/reference/mask_ref.py`

Usage: `python3 spec/reference/mask_ref.py spec/mask_vectors.json`

```python
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
```

### F.3 `spec/reference/pay_ref.py`

Usage: `python3 spec/reference/pay_ref.py spec/paycheck_cases.json`

```python
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
```

## APPENDIX G: `BUILD_LOG.md` TEMPLATE

```markdown
# SATYA BUILD LOG

| Phase | Started | Gate | Result | Notes |
|---|---|---|---|---|
| 0 Scaffold | | rules_ref / mask_ref / pay_ref ALL PASS | | |
| 1 Core | | gradle :core:test, vitest, pytest mask | | |
| 2 DB + seed | | doctor --only db (C5, C11), seed idempotent | | |
| 3 Gateway | | doctor C1 C2 C3 C4 C6 C7 (local, prod) | | |
| 4 VIVEK + AI | | doctor C8 C9 C10, model eval | | |
| 5 Console | | doctor --e2e, Pay Check P01-P03 in UI | | |
| 6 Android | | one-door, Doctor D1-D19 on A and B, sequences A + B | | |
| 7 Hardening | | full demo script x2, Doctor green after reboot | | |

## Doctor output (latest)
(paste table)

## Model eval
(paste report)

## Deviations from SATYA_ARCHITECTURE.md
(each deviation: what, why, and the section updated)
```

## APPENDIX H: `/v1/ask` PROMPT

System message (exact):
```
You label what an Indian financial message or call transcript is asking the recipient to do.
The text is masked: tokens like [UPI_1], [LINK_1], [PHONE_1], [CODE], [ACCOUNT], [NAME] replace real values.
The text may be English, Hindi or Hinglish.
Reply with ONLY a JSON object, no prose:
{"ask_type": "...", "claimed_bank": "...", "urgency": "high|normal", "confidence": 0.0}
ask_type must be one of:
share_secret (asks for OTP, PIN, UPI PIN, CVV, password or card details),
remote_access (asks to install or open a screen-share or remote-control app),
move_money (asks to transfer money to another, safe, secure or verification account),
pay_fee (asks to pay a fee, fine, charge or penalty),
click_link (asks to open a link to log in, verify or update),
kyc_update (asks to update KYC, PAN or Aadhaar),
call_back (asks to call a number),
sales_offer (loan, card or product offer),
info_only (informs, asks nothing),
other.
claimed_bank must be one of: SBI, HDFC, ICICI, AXIS, PNB, OTHER, NONE.
```
User message: the masked text only. Parse JSON; validate both enums; clamp confidence to [0, 1]; on any failure retry once, then return `{"ask_type":"unknown","claimed_bank":"NONE","urgency":"normal","confidence":0,"source":"fallback"}`.

---

## 21. v1.1 CHANGES (2026-10-24)

Each change was made here first, then built. Mirrored in `BUILD_LOG.md` under Deviations.

1. **G08_NO_KYC_FEE + check type `asks_fee_with_phrase`.** The design's headline demo ("Pay ₹10 KYC fee to sbi.kyc@ybl") broke no v1.0 promise except G03. Adds `PAY_VERBS` to the oracle, AI mapping `pay_fee → G08`, cases T09 and N08 (Appendix A now 17 cases).
2. **Oracle reads JSON as UTF-8** (`open(..., encoding="utf-8")`), so the Hindi promise text works on Windows. No behaviour change.
3. **AI provider default = `satya-ai`**, a Cloudflare Worker (`ai-worker/`) exposing OpenAI-compatible `/v1/chat/completions`, `/v1/audio/transcriptions` and `/v1/models` on Cloudflare Workers AI (Qwen chat model, Whisper STT, free tier). Protected by a bearer key. VIVEK still talks to it only through `AI_BASE_URL` + `AI_API_KEY`, so Groq or any compatible provider is a config change.
4. **Proof Receipt gains `kill_chain_stage` and `verdict`** (Section 9.5) to drive the design's Kill chain bar and verdict stamp. Words, never colours.
5. **Samsung (One UI) defaults.** Edge strip on the **left** edge on Samsung (One UI's Edge Panel handle sits on the right); side and vertical position are settings. Watched packages include `com.samsung.android.messaging`, `com.samsung.android.dialer`, `com.samsung.android.incallui`, `com.samsung.android.email.provider`. If the call screening role is unavailable, `PhoneStateReceiver` (`READ_PHONE_STATE` + `READ_CALL_LOG`, optional) supplies the ringing number to the same U3 function.
6. **Quick Settings tile "Check screen"** (from the design) is a second trigger for Circle to Check, next to the triple tap. With Accessibility off it falls back to a one-frame MediaProjection capture with the system consent dialog.
7. **Doctor reliability mode.** Every on-device check can run N times (default 10) and reports pass rate and median latency per feature; the CLI Doctor has `--repeat N`.
8. **GLOBAL card `upi_apps`** list for Know Your App (UPI apps are not banks).
9. **An AI label needs evidence in the text** (`AskMapping.hasEvidence`). The model may recognise a paraphrase ("the 6 digit number you got"), but an AI-assisted hit is added only when the masked text carries a word for that ask (`share_secret`: otp, pin, code, digit…, and never "pin code", which is an address, N02). Still capped at High.
10. **The official channel outranks the AI.** When the verdict from the rules alone is Keeps (official sender, official number), no AI-assisted hit is added. A genuine OTP SMS or debit alert can never be turned into a warning by a model's guess.
11. **VIVEK prompt guidance.** Appendix H stays verbatim; VIVEK appends a short "rules for hard cases" block (danger order, "tell me the code" in Hindi/Hinglish, alerts are info_only, pin code is postal, YONO = SBI…) and five few-shot turns that share no text with `vivek/eval/ask_cases.json`. Measured on Qwen3-4B: tuning set 16/20 → 19/20, held-out set 10/14 → 13/14, median latency unchanged (0.78 s).
12. **Self-hosted AI path** (Section 18 backup, no cloud account): `tools/local-cloud.sh` runs Qwen3-4B (Apache-2.0, llama.cpp, Vulkan GPU) as the OpenAI-compatible provider, and VIVEK transcribes in-process when `AI_STT_MODEL=local:openai/whisper-small` (Apache-2.0), from samples already in RAM. VIVEK keeps its own temp dir (`satya-vivek`, or `VIVEK_TMPDIR`) so C10's `tmp_files` counts only what VIVEK could have written.
13. **Loopback cleartext.** Section 13.2's `usesCleartextTraffic="false"` becomes `network_security_config.xml`: HTTPS everywhere except `127.0.0.1`/`localhost`, which never leaves the phone. With `adb reverse tcp:8000 tcp:8000` a USB-connected test phone uses a laptop's VIVEK at `http://127.0.0.1:8000` without a public tunnel.

---

## 22. v1.2 CHANGES (2026-10-25, release 0.3.0)

Each change was made after reproducing the failure on the Android 15 emulator. They are mirrored in `BUILD_LOG.md`.

1. **AI provider = Sarvam, behind the gateway.** Sarvam is called from `web/lib/ai/` with `SARVAM_API_KEY`, which is server only:
   - `sarvam-105b` for chat (`reasoning_effort: null`, JSON mode);
   - `saaras:v3` for speech-to-text.
   - The phone's `AskLabel` and `VoiceNote` packets go to `POST /api/v1/ai/analyze` and `/api/v1/ai/voice` on the gateway instead of VIVEK.
   - The Appendix H labels are unchanged. The answer adds `risk` (scam | suspicious | safe | unclear), `summary` / `summary_hi`, up to 3 `reasons`, and `advice` / `advice_hi`.
   - Measured on `vivek/eval/ask_cases.json`: 18/20 tuning, 13/14 held out, median 0.8 s.
   - VIVEK (Section 11) stays optional, for deepfake scores and self-hosting.
2. **Every user-triggered check with text asks the AI** (`Router.askCloud` = user trigger and at least 12 letters), also when a rule fired, so the receipt can explain. Background checks never ask (Law 1 unchanged).
3. **Verdict `suspicious` ("Looks like a scam").** It applies only when all of these hold:
   - no rule hit;
   - the rules-only verdict is Unknown (never over Keeps);
   - no herd confirmation;
   - the AI says `risk = scam` with confidence of at least 0.75.
   - Its overall severity is Medium.
   - "Breaks promise" still comes only from rules (Law 3).
4. **Gateway storage = private Vercel Blob store** (`web/lib/store.ts`) until the Section 12 database exists:
   - `reports/<id>.json` holds the sealed box, tags and status; `index/<bank>.json` is the inbox;
   - `herd/<prefix>.json` holds the per-day sighting tokens (kept 8 days), report counts and confirmations;
   - `blocklist.json` holds the blocklist.
   - Each read-modify-write is a compare-and-swap on the ETag (weak ETags are normalised).
   - The registry route serves the signed bundle shipped with the gateway plus the live blocklist.
5. **NYAYA is reduced to three features.** They are Report Inbox (with an optional AI case brief), Scam Check (the same signed rules plus AI), and Blocklist.
   - Sign-in is a bank and the `NYAYA_PASSWORD`; the session is an HMAC-signed HttpOnly cookie (`NYAYA_SECRET`).
   - Bank Box keys are still imported into the browser only.
   - Radar, Deepfake Re-check, the Promise Card editor and Pay Check are removed from the console. Their libraries and vectors stay in `spec/` and `web/lib/satya/`.
6. **Capture reads only the app on screen.**
   - `screenTexts()` keeps only `TYPE_APPLICATION` windows that are not System UI or a launcher.
   - Content descriptions (button labels) are used only when a screen has no real text.
   - Before this, status-bar icon labels ("Phone notification: 18001800") entered the checked text and the report.
7. **Know Your App rule.** A suspect is an app installed outside a trusted store that presents itself as a bank, KYC or payment app, or a copy of a listed package with the wrong signing certificate.
   - Trusted stores: Play Store, Galaxy Store and OEM stores.
   - Matching is by whole words, so "cupid" is not "upi".
   - `KnownApps` lists 22 more genuine finance packages; they count as verified only when installed from a trusted store.
   - `pruneWatch()` removes watchlist entries the old rule added, so Suspect Watch never blocks a genuine bank app's PIN screen.
   - "Ask SATYA AI" sends only the app's label, package id and install source (`AppOpinion` packet).
8. **The accessibility button is the third Circle to Check trigger** (`flagRequestAccessibilityButton`). It works as the floating button, gesture or shortcut, chosen in Settings, Accessibility, SATYA.
9. **Activation = The Convergence** (Brand Guide v1.0, 02 Motion), drawn from the Lattice tile primitives.
   - Timeline: Paper 0.15-1.15 s; Pattern 0.35-2.06 s with a 60 ms stagger; Seal 2.05-2.50 s; Name 2.40-3.40 s; hold; release at 2x.
   - After it, a status screen shows what is on, with a way back to Setup.
10. **Navigation.**
    - The same route is never pushed twice.
    - Deep links arrive only through the `MainActivity` intent (singleTask), so the in-process flow was removed.
    - The back stack is saved in `onSaveInstanceState`.
11. **Report to any bank.** When no bank is claimed, the Report screen offers the banks that have a Box key. The sealed payload carries the AI reading for the bank.
