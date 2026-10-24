# Security policy

SATYA handles fraud reports and the keys that seal them, so we take vulnerabilities seriously.

## Supported versions

| Version | Supported |
|---|---|
| 0.3.x (current) | Yes |
| 0.2.x and older | No, please update |

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.

Include:
- what is affected (app, gateway, console, a specific protocol);
- the steps to reproduce;
- the impact you expect.

We aim to acknowledge a report within 3 working days and to agree a disclosure date with you.

## In scope

- Anything that lets a background check send content off the phone, or bypass `KavachClient` (Law 1, Law 2).
- Forging or replaying a Promise Card, a registry bundle or a delivery receipt.
- Reading a sealed report without the bank's Box key, or reading another bank's reports in NYAYA.
- Getting a real secret (API keys, signing keys) out of the app, the gateway or this repository.
- Making a genuine bank message show *Breaks promise* or *Looks like a scam*, or a scam show *Keeps promise*, with the rules as published.

## Out of scope

- Findings that need a rooted phone or physical access to an unlocked phone.
- The demo console password on a public demo deployment.
- Rate limits on the public demo.

## How secrets are handled

- **Private keys** stay out of Git: the root key and the bank Sign and Box keys are in the gitignored `keys/`.
- **Pre-commit check:** [`tools/secret_guard.py`](tools/secret_guard.py) checks every commit against every secret value on the machine and against known key formats.
- **The app** ships only public keys and its app key. It verifies every Promise Card against a pinned root key.
- **The Sarvam AI key**, the Blob token and the console secrets exist only as Vercel environment variables and in the gitignored `web/.env.local`.
