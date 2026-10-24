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
| [`vivek/`](vivek/) | VIVEK: masking, AI labelling, speech-to-text and deepfake scoring service (FastAPI; Modal, Docker or a laptop). |
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

## Run the AI yourself (no cloud account)

Everything VIVEK needs runs on one laptop with open models:

| Part | Model | Licence |
|---|---|---|
| Ask labelling | Qwen3-4B (Q4_K_M GGUF) on [llama.cpp](https://github.com/ggml-org/llama.cpp), GPU via Vulkan or CPU | Apache-2.0 |
| Speech-to-text | `openai/whisper-small`, in-process, int8 | Apache-2.0 |
| Voice / face deepfake score | see [`vivek/models.json`](vivek/models.json) | per model card |

```bash
bash tools/local-cloud.sh --local          # Qwen on :8081, VIVEK on :8000 (127.0.0.1 only)
adb reverse tcp:8000 tcp:8000              # USB test phone -> laptop, nothing exposed publicly
# phone: Doctor -> Override URLs -> VIVEK = http://127.0.0.1:8000
```

Without `--local`, the script also opens a Cloudflare quick tunnel so the gateway and phones on any network can reach VIVEK. Accuracy and latency of each model are in [`BUILD_LOG.md`](BUILD_LOG.md#model-eval).

## Build status

Every phase gate and its result is in [`BUILD_LOG.md`](BUILD_LOG.md).

## Licence

Apache License 2.0, see [`LICENSE`](LICENSE). The fonts (Sora, Hanken Grotesk, Noto Sans Devanagari) are under the SIL Open Font License. Documents in `data/bank-rules/` belong to their publishers and are included for reference.
