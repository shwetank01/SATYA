"""In-process speech-to-text for self-hosted VIVEK (AI_STT_MODEL=local:<hf id>, e.g. local:openai/whisper-small).

Used when no OpenAI-compatible STT endpoint is available (the Cloudflare worker is the default).
Works on the float32 samples already in RAM: no file is written (VISMRITI).
"""
import threading

import numpy as np

RATE = 16000
WINDOW = 30 * RATE      # Whisper's input window
MAX_SECONDS = 90        # longer clips are cut; a scam call's ask is in the first minute
# Whisper often hears Hindi as Urdu and writes it in Urdu script, which the rules cannot read.
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
            _model.clear()
            _model[model_id] = (proc, model)
        return _model[model_id]


def loaded(model_id):
    return model_id in _model


def warm(model_id):
    """Load and run one second of silence, so the first real call is not the slow one."""
    transcribe(model_id, np.zeros(RATE, dtype=np.float32))


def transcribe(model_id, samples):
    """-> (text, language, ok). Never raises."""
    try:
        import torch
        proc, model = _load(model_id)
        samples = np.asarray(samples, dtype=np.float32)[: MAX_SECONDS * RATE]
        if samples.size < RATE // 4:
            return "", None, False
        windows = [samples[i:i + WINDOW] for i in range(0, samples.size, WINDOW)]
        with torch.inference_mode():
            first = proc(windows[0], sampling_rate=RATE, return_tensors="pt").input_features
            lang_tok = proc.tokenizer.decode(model.detect_language(first)[0])  # "<|hi|>"
            lang = LANG_MAP.get(lang_tok.strip("<|>"), lang_tok.strip("<|>"))
            texts = []
            for w in windows:
                feats = proc(w, sampling_rate=RATE, return_tensors="pt").input_features
                out = model.generate(feats, task="transcribe", language=lang, max_new_tokens=220)
                texts.append(proc.batch_decode(out, skip_special_tokens=True)[0].strip())
        return " ".join(t for t in texts if t), lang, True
    except Exception:
        return "", None, False
