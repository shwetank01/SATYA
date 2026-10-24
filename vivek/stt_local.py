"""In-process speech-to-text for self-hosted VIVEK (AI_STT_MODEL=local:<hf id>, e.g. local:openai/whisper-small).

Used when no OpenAI-compatible STT endpoint is available (the Cloudflare worker is the default).
Works on the float32 samples already in RAM: no file is written (VISMRITI).

Measured on this repo's eval clips (CPU, whisper-small): int8 dynamic quantisation is ~1.5-2x faster
with the same transcripts; tones and silence make Whisper hallucinate ("you", Welsh), so a
no-speech gate and a language list for India come first, and the token budget follows clip length.
"""
import os
import threading

import numpy as np

RATE = 16000
WINDOW = 30 * RATE      # Whisper's input window
MAX_SECONDS = 90        # longer clips are cut; a scam call's ask is in the first minute
NO_SPEECH = 0.6         # P(<|nocaptions|>) above this: no speech, empty transcript
# English plus the scheduled Indian languages Whisper knows. Urdu is heard for Hindi and written
# in Urdu script, which the rules cannot read, so it maps to Hindi.
LANGS = ["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "as", "ne", "sa"]
LANG_MAP = {"ur": "hi"}

_lock = threading.Lock()
_model = {}


def _load(model_id):
    with _lock:
        if model_id not in _model:
            import torch
            from transformers import WhisperForConditionalGeneration, WhisperProcessor
            from transformers.utils import logging as hf_logging
            hf_logging.set_verbosity_error()  # one log line per request (app.py); no per-call warnings
            hf_logging.disable_progress_bar()
            proc = WhisperProcessor.from_pretrained(model_id)
            model = WhisperForConditionalGeneration.from_pretrained(model_id, torch_dtype=torch.float32).eval()
            if os.environ.get("VIVEK_STT_INT8", "1") != "0":
                try:
                    import warnings
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore")
                        model = torch.ao.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)
                except Exception:
                    pass  # fp32 still works, only slower
            tok = proc.tokenizer
            ids = {
                "sot": tok.convert_tokens_to_ids("<|startoftranscript|>"),
                "nocap": tok.convert_tokens_to_ids("<|nocaptions|>"),
                "langs": [(l, tok.convert_tokens_to_ids(f"<|{l}|>")) for l in LANGS],
            }
            _model.clear()
            _model[model_id] = (proc, model, ids)
        return _model[model_id]


def loaded(model_id):
    return model_id in _model


def warm(model_id):
    """Load and run one short clip, so the first real call is not the slow one."""
    t = np.arange(RATE) / RATE
    transcribe(model_id, (0.2 * np.sin(2 * np.pi * 220 * t)).astype(np.float32))


def _probe(model, ids, feats):
    """One decoder step after <|startoftranscript|>: P(no speech) and the most likely listed language."""
    import torch
    logits = model(input_features=feats, decoder_input_ids=torch.tensor([[ids["sot"]]])).logits[0, -1].float()
    p = torch.softmax(logits, -1)
    lang = max(ids["langs"], key=lambda li: logits[li[1]].item())[0]
    return p[ids["nocap"]].item(), LANG_MAP.get(lang, lang)


def transcribe(model_id, samples):
    """-> (text, language, ok). Never raises. No speech -> ("", language, True)."""
    try:
        import torch
        proc, model, ids = _load(model_id)
        samples = np.asarray(samples, dtype=np.float32)[: MAX_SECONDS * RATE]
        if samples.size < RATE // 4:
            return "", None, False
        windows = [samples[i:i + WINDOW] for i in range(0, samples.size, WINDOW)]
        texts, lang = [], None
        with torch.inference_mode():
            for w in windows:
                if w.size < RATE // 4:
                    break
                feats = proc(w, sampling_rate=RATE, return_tensors="pt").input_features
                p_none, wl = _probe(model, ids, feats)
                lang = lang or wl
                if p_none > NO_SPEECH:
                    continue
                budget = min(220, 16 + int(w.size / RATE * 12))  # ~12 tokens/s covers Hindi in Devanagari
                out = model.generate(feats, task="transcribe", language=lang, max_new_tokens=budget)
                texts.append(proc.batch_decode(out, skip_special_tokens=True)[0].strip())
        return " ".join(t for t in texts if t), lang, True
    except Exception:
        return "", None, False
