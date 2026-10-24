# SATYA

**Check what a message asks for against what your bank has promised it will never ask for.**

SATYA is an open-source shield against deepfake and impersonation fraud in Indian financial communications, built for the RAKSHAM AI Cybersecurity Hackathon (IIT Delhi), Problem Statement 03.

A scammer can fake a voice, a face, a logo or a sender name. What they cannot fake is the request itself: *share your OTP*, *install AnyDesk*, *move your money to a safe account*, *pay a ₹10 KYC fee to this UPI ID*. Banks and the RBI have already said, in writing, that they never ask for these things. SATYA turns those statements into signed **Promise Cards** and checks every request against them, on the phone, before money moves. Deepfake scores are a supporting signal, never the verdict.

## What is in this repo

| Path | What |
|---|---|
| [`SATYA_ARCHITECTURE.md`](SATYA_ARCHITECTURE.md) | The build specification. Single source of truth. |
| [`spec/`](spec/) | Shared test vectors, Python reference implementations (the oracle every language must match) and the Promise Registry `satya_bank_promises.json`. |
| [`data/bank-rules/`](data/bank-rules/) | The official RBI, TRAI, NPCI and bank documents each promise cites. |
| [`android/`](android/) | The SATYA Android app (Kotlin, Jetpack Compose) and a harmless fake-KYC demo app. |
| [`web/`](web/) | NYAYA, the bank and company console, plus the gateway API (Next.js on Vercel). |
| [`vivek/`](vivek/) | VIVEK: masking, AI labelling and deepfake scoring service (FastAPI on Modal). |
| [`ai-worker/`](ai-worker/) | `satya-ai`: SATYA's own OpenAI-compatible AI endpoint on Cloudflare Workers AI (Qwen + Whisper). |
| [`setu/`](setu/) | SETU: privacy relay on Cloudflare Workers that strips identifying headers. |
| [`supabase/`](supabase/) | Database schema, row-level security and retention timers. |
| [`design/`](design/) | The design handoff the apps are built from. |

## The five laws

1. Background checks never upload content. Only a user action can send text, images or audio off the phone.
2. One door out: every byte that leaves the phone goes through one audited client.
3. Rules run on the phone. The cloud labels, scores and counts; it never decides.
4. The cloud processes in memory and forgets. No phone-user accounts, no IP logs.
5. Only the bank can open a report: reports are sealed to the bank's public key on the phone.

## Build status

Every phase gate and its result is in [`BUILD_LOG.md`](BUILD_LOG.md).

## Licence

Apache License 2.0, see [`LICENSE`](LICENSE). The fonts (Sora, Hanken Grotesk, Noto Sans Devanagari) are under the SIL Open Font License. Documents in `data/bank-rules/` belong to their publishers and are included for reference.
