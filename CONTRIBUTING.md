# Contributing to SATYA

Thanks for helping people check a request before they lose money. This guide covers setup, the rules every change follows, and how to send a pull request.

## Ground rules

1. **The specification wins.** [`SATYA_ARCHITECTURE.md`](SATYA_ARCHITECTURE.md) is the source of truth. If a change has to differ from it, add a row to Section 21 (deviations) and to [`BUILD_LOG.md`](BUILD_LOG.md) in the same pull request.
2. **Every language matches the shared vectors.**
   - Rules, masking, hashing and crypto have reference implementations in [`spec/reference/`](spec/reference/), with vectors in [`spec/`](spec/).
   - Kotlin and TypeScript must pass the same vectors as the Python oracle.
3. **The five laws are not negotiable.**
   - Background checks never upload content.
   - Everything that leaves the phone goes through `KavachClient`.
   - Rules decide; the cloud only labels and explains.
   - Nothing about a phone user is stored.
   - Reports are sealed to the bank's key on the phone.
4. **No secrets in Git, ever.**
   - The repository is public.
   - Keys live in the gitignored `keys/`, `android/secrets.properties` and `web/.env.local`.
   - The pre-commit hook ([`tools/secret_guard.py`](tools/secret_guard.py)) refuses any commit that contains a real key.

## Set up

```bash
git config core.hooksPath tools/githooks     # once per clone: turns on the secret guard
```

| Part | Needs | Start |
|---|---|---|
| Android app | JDK 21, Android SDK (compileSdk 37) | `cd android && ./gradlew :app:assembleDebug` |
| Gateway + NYAYA | Node 22 | `cd web && npm ci && npm run dev` |
| Python oracles, VIVEK | Python 3.11 | `python spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json` |

Copy `android/secrets.properties.example` and `web/.env.example` and fill them in. `npx tsx web/scripts/gen-keys.ts` creates a fresh set of demo keys.

## Before you open a pull request

Run the suites that cover your change:

```bash
python spec/reference/rules_ref.py spec/satya_bank_promises.json spec/rule_cases.json
(cd android && ./gradlew :core:test :app:testDebugUnitTest)
bash tools/check_one_door.sh
(cd web && npx vitest run && npx next build)
```

For app changes, also run **Doctor → Run all** on a phone or emulator, and paste the result into the pull request.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(android): …`, `fix(gateway): …`, `docs: …`, `test(web): …`, `chore: …`.
- Keep one logical change per commit, and say *why* in the body when it is not obvious.
- A new promise rule needs:
  - a source document in `data/bank-rules/`;
  - an entry in `spec/satya_bank_promises.json` with its `source` URL;
  - a positive and a negative case in `spec/rule_cases.json`.
- User-facing text is plain English (and Hindi where the app shows Hindi). Never say a message is "safe": say "This does not prove it is safe."

## Reporting bugs and ideas

Open an issue with the templates. For anything security-related, follow [`SECURITY.md`](SECURITY.md) instead of filing a public issue.
