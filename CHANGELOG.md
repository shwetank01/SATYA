# Changelog

All notable changes to SATYA. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Each version is tagged (`vX.Y.Z`); signed APKs are shared directly by the maintainers.

## [0.4.0] - 2026-10-25

NYAYA becomes a product institutions pay for: ten features for bank fraud desks and company finance teams, each one shown end to end. The business case is in [`docs/INSTITUTIONS.md`](docs/INSTITUTIONS.md). The Android app is unchanged; installed phones already accept everything new.

### Added
- **Fraud Overview.** Volumes, median time from report to action, values blocked, and customers warned.
  - Loss avoided is estimated from the I4C 2024 average loss per reported fraud and an assumption the analyst can see and change.
  - The case register exports as CSV.
- **Impersonation Radar.** Reports are grouped into campaigns by shared scammer UPI IDs, numbers, sites and apps.
- **Mule Watch.** Accounts confirmed fake by any bank are routed to the bank that holds them, by UPI handle or IFSC. The bank can match its own accounts privately, in the browser.
- **Promise Card Builder.** A bank edits its official channels, signs them in the browser with its own key, and publishes them to every phone.
  - A before-and-after preview runs the phone's rules.
  - One click returns to the root-signed card.
- **Scam Check API.** Per-bank keys, stored as hashes; usage is metered and capped daily, and a live "Try it" is built in. Scam Check becomes the contact-centre copilot, with the words to say back in English and Hindi.
- **Pay Check for companies** (Acme Industries in the demo):
  - Pay Rules with hashed vendor accounts, approvers, limits and channels.
  - HOLD or CLEAR on the Appendix E rules, plus network flags: the destination account or UPI ID was confirmed fake by a bank, or reported by users.
  - Verify Before Release with a recorded callback.
  - A signed Evidence PDF.
- **Named analysts and an audit trail** for every console action. Organisations can have their own passwords (`NYAYA_ORG_PASSWORDS`).
- **Demo data** (`npm run demo:seed` / `demo:clean`). A week of sealed reports for all five banks, 16 campaigns, 7 cross-bank mule accounts and Acme's history. Every record is flagged and labelled "Demo".
- The smoke test grows from 15 to 25 steps, covering every new feature, and removes what it wrote.

### Fixed
- Scam Check in the console raised "Looks like a scam" at 70% confidence; it now uses the phone's 75%.
- A kill read every report in the inbox to find the ones to close; the inbox index now carries the fingerprints.
- Smoke tests left reports and blocks in production; `demo-data.ts clean-smoke` removes the old ones.
- The console polled while hidden in a background tab, and had no favicon.

### Changed
- Banks land on the Overview after sign-in. Navigation is grouped as Detect, Respond, Prevent and Govern.
- `SATYA_STORE_PREFIX` keeps local runs in their own namespace of the Blob store.

## [0.3.0] - 2026-10-25

### Added
- **SATYA AI on Sarvam.** The gateway calls Sarvam (`sarvam-105b` for text, `saaras:v3` for speech).
  - It sends a plain-language explanation in English and Hindi with every check the user starts.
  - It transcribes voice notes and gives a second opinion on apps.
  - The key stays on the server.
- **"Looks like a scam" verdict.** It appears when no promise matches but the AI is at least 75% sure. Rules alone still decide "Breaks promise".
- **Circle to Check from Android's accessibility button**, gesture or shortcut, as a third trigger.
- **The Convergence**, the Brand Guide's activation animation, followed by an honest status screen. It can be replayed from Settings.
- **NYAYA, reduced to three working features:** Report Inbox (with an AI case brief), Scam Check, and Blocklist. Sign-in is by bank and console password.
- **Report to any bank.** You can pick the bank when the message names none. The sealed report also carries the AI reading.
- `web/scripts/smoke.ts` (15-step live end-to-end test) and `web/scripts/eval-sarvam.ts` (labelling accuracy).
- Community files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull request templates, `.editorconfig`.

### Fixed
- **Report to bank never delivered.** The gateway had no database. It now stores reports, herd counts and the blocklist in a private Vercel Blob store, using compare-and-swap updates.
- **Circle to Check read the status bar and notification icons into the message.** It now reads only the app on screen.
- **Know Your App flagged genuine bank apps as suspects.**
  - Only apps installed outside an app store, or copies with the wrong signature, can be suspects.
  - Apps wrongly flagged before are removed from Suspect Watch.
- **Back sometimes did nothing.** The same screen is never pushed twice, deep links arrive once, and the back stack survives rotation.
- Reports carrying an account-number indicator were rejected by the gateway.

### Changed
- The AI label is requested for every user-started check with text, not only when no rule fired.
- Doctor D14, D15 and D17 now test the gateway's AI. D16 (face score) is optional.

## [0.2.0] - 2026-10-25

### Added
- Self-hosted AI: Qwen3-4B on llama.cpp, Whisper-small speech-to-text, and deepfake classifiers chosen by evaluation.
- A phone can use a laptop's AI over USB (`adb reverse`); plain HTTP is allowed only to the loopback address.

### Fixed
- An AI label can no longer cause a false alarm without lexical evidence, or over a bank's official channel.
- Corrected the PNB toll-free list.

## [0.1.0] - 2026-10-24

### Added
- First build: all phone protocols (DRISHTI, PRAHARI, KAVACH, VACHAN, SANGH, DOOT, SAKSHI), the design screens and overlays, and Doctor.
- Gateway API, NYAYA console, Cloudflare workers, VIVEK service and Supabase schema.

[0.3.0]: https://github.com/workblue21/SATYA/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/workblue21/SATYA/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/workblue21/SATYA/releases/tag/v0.1.0
