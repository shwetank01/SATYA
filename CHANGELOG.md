# Changelog

All notable changes to SATYA. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Each version is tagged (`vX.Y.Z`); signed APKs are shared directly by the maintainers.

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
