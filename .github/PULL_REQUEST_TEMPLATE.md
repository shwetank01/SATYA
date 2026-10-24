## What and why

<!-- One or two sentences. Link the issue: Fixes #123 -->

## How it was tested

- [ ] `python spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json`
- [ ] `cd android && ./gradlew :core:test :app:testDebugUnitTest` and `bash tools/check_one_door.sh`
- [ ] `cd web && npx vitest run && npx next build`
- [ ] App change: Doctor → Run all on a phone or emulator (paste the summary)

## Checklist

- [ ] No secrets, real victims' data or `.env` files (the pre-commit secret guard passed)
- [ ] The five laws still hold (nothing uploaded in the background, one door out, rules decide)
- [ ] A deviation from `SATYA_ARCHITECTURE.md` is recorded in Section 21 and `BUILD_LOG.md`
- [ ] User-facing text is plain English, and never says a message is "safe"
