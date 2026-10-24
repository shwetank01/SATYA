"""OpenAI-compatible AI client (Section 8.9). Talks only to AI_BASE_URL with AI_API_KEY.

Default provider is SATYA's own Cloudflare Workers AI gateway (ai-worker/, Qwen + Whisper);
Groq, OpenAI or any compatible endpoint works by changing the two environment variables.
Every chat call re-masks the text first (defence in depth) and never raises: on any failure
the caller gets the documented fallback.
"""
import io
import json
import os
import time
import wave

import httpx

from masker import mask

ASK_TYPES = {"share_secret", "remote_access", "move_money", "pay_fee", "click_link", "kyc_update",
             "call_back", "sales_offer", "info_only", "other"}
BANKS = {"SBI", "HDFC", "ICICI", "AXIS", "PNB", "OTHER", "NONE"}

# Appendix H, verbatim, plus the v1.1 pay_fee line.
SYSTEM_PROMPT = """You label what an Indian financial message or call transcript is asking the recipient to do.
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
claimed_bank must be one of: SBI, HDFC, ICICI, AXIS, PNB, OTHER, NONE."""

FALLBACK = {"ask_type": "unknown", "claimed_bank": "NONE", "urgency": "normal", "confidence": 0, "source": "fallback"}


def _cfg():
    return {
        "base": os.environ.get("AI_BASE_URL", "").rstrip("/"),
        "key": os.environ.get("AI_API_KEY", ""),
        "chat": os.environ.get("AI_CHAT_MODEL", ""),
        "stt": os.environ.get("AI_STT_MODEL", ""),
    }


def _client(timeout):
    c = _cfg()
    return httpx.Client(base_url=c["base"], timeout=timeout, headers={"Authorization": f"Bearer {c['key']}"})


def _first_json(s):
    start = s.find("{")
    while start >= 0:
        depth = 0
        for i in range(start, len(s)):
            if s[i] == "{":
                depth += 1
            elif s[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[start:i + 1])
                    except ValueError:
                        break
        start = s.find("{", start + 1)
    return None


def validate(obj):
    """Validate both enums and clamp confidence; None if the answer is unusable."""
    if not isinstance(obj, dict):
        return None
    at = str(obj.get("ask_type", "")).strip().lower()
    cb = str(obj.get("claimed_bank", "NONE")).strip().upper()
    if at not in ASK_TYPES:
        return None
    if cb not in BANKS:
        cb = "OTHER" if cb else "NONE"
    try:
        conf = float(obj.get("confidence", 0))
    except (TypeError, ValueError):
        conf = 0.0
    urg = "high" if str(obj.get("urgency", "normal")).lower() == "high" else "normal"
    return {"ask_type": at, "claimed_bank": cb, "urgency": urg, "confidence": max(0.0, min(1.0, conf)), "source": "ai"}


def label(text, hint_bank=None):
    """/v1/ask: one retry on 429/5xx or invalid output, then the fallback."""
    c = _cfg()
    if not (c["base"] and c["key"]):
        return dict(FALLBACK)
    masked = mask(text)[:4000]
    user = masked if not hint_bank else f"{masked}\n\n(The phone guessed the claimed bank: {hint_bank})"
    body = {
        "model": c["chat"] or None,
        "temperature": 0,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
    }
    if not body["model"]:
        body.pop("model")
    for attempt in range(2):
        try:
            with _client(8.0) as h:
                r = h.post("/chat/completions", json=body)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(0.4)
                continue
            if r.status_code != 200:
                break
            content = r.json()["choices"][0]["message"]["content"]
            v = validate(_first_json(content or ""))
            if v:
                return v
        except Exception:  # network, JSON, shape: degrade, never fail
            time.sleep(0.2)
    return dict(FALLBACK)


def wav_bytes(samples_f32, rate=16000):
    """Float32 mono samples -> 16-bit PCM WAV in memory (avoids .opus/codec surprises at the STT)."""
    import numpy as np
    pcm = (np.clip(samples_f32, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def transcribe(wav):
    """/audio/transcriptions -> (text, language, ok). Never raises."""
    c = _cfg()
    if not (c["base"] and c["key"] and c["stt"]):
        return "", None, False
    for attempt in range(2):
        try:
            with _client(20.0) as h:
                r = h.post("/audio/transcriptions", files={"file": ("audio.wav", wav, "audio/wav")}, data={"model": c["stt"]})
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(0.5)
                continue
            if r.status_code != 200:
                return "", None, False
            j = r.json()
            return (j.get("text") or "").strip(), j.get("language"), True
        except Exception:
            time.sleep(0.3)
    return "", None, False


def health():
    """Section 17 C9: is the provider reachable and does it list our models?"""
    c = _cfg()
    out = {"reachable": False, "chat_model_ok": False, "stt_model_ok": False, "base": c["base"].split("//")[-1].split("/")[0] if c["base"] else None}
    if not (c["base"] and c["key"]):
        return out
    try:
        with _client(5.0) as h:
            r = h.get("/models")
        if r.status_code == 200:
            ids = {m.get("id") for m in r.json().get("data", [])}
            out.update(reachable=True, chat_model_ok=(not c["chat"]) or c["chat"] in ids, stt_model_ok=bool(c["stt"]) and c["stt"] in ids)
    except Exception:
        pass
    return out
