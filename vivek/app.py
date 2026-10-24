"""VIVEK (Section 8.9 / 11): AI labels + deepfake scores. Processes in RAM and forgets (VISMRITI).

Rules:
- Bodies are read with `await request.body()`; never UploadFile (it spools files over 1 MB to disk).
- One log line per request: route, status, duration. Nothing else.
- Every endpoint degrades instead of failing.
"""
import hmac
import logging
import os
import sys
import tempfile
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import ai_client
from audio import decode
from scoring import Scorer, crop_faces, decode_frames

log = logging.getLogger("vivek")
if not log.handlers:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(h)
    log.setLevel(logging.INFO)

MAX_ASK_CHARS = 4000
MAX_VOICE = 15 * 1024 * 1024
MAX_FACE_BODY = 5 * 300 * 1024 * 4 // 3 + 4096  # 5 frames of 300 KB, base64


def _tmp_count():
    try:
        return len(os.listdir(tempfile.gettempdir()))
    except OSError:
        return -1


def create_app(scorer: Scorer | None = None) -> FastAPI:
    app = FastAPI(title="VIVEK", docs_url=None, redoc_url=None, openapi_url=None)
    sc = scorer or Scorer().load()
    app_key = os.environ.get("SATYA_APP_KEY", "")

    @app.middleware("http")
    async def guard(request: Request, call_next):
        t0 = time.perf_counter()
        key = request.headers.get("x-satya-app", "")
        if not app_key or not hmac.compare_digest(key, app_key):
            resp = JSONResponse({"error": "unauthorized"}, status_code=401)
        else:
            try:
                resp = await call_next(request)
            except Exception:
                resp = JSONResponse({"error": "internal"}, status_code=500)
        log.info("%s %s %d %dms", request.method, request.url.path, resp.status_code, (time.perf_counter() - t0) * 1000)
        return resp

    @app.get("/health")
    async def health():
        return {"ok": True, "models": sc.status(), "ai": ai_client.health(), "tmp_files": _tmp_count(), "errors": sc.errors or None}

    @app.post("/v1/ask")
    async def ask(request: Request):
        if int(request.headers.get("content-length") or 0) > MAX_ASK_CHARS * 4 + 1024:
            return JSONResponse({"error": "too_large"}, status_code=413)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid_json"}, status_code=400)
        text = body.get("text") if isinstance(body, dict) else None
        if not isinstance(text, str) or not text.strip():
            return JSONResponse({"error": "text_required"}, status_code=400)
        if len(text) > MAX_ASK_CHARS:
            return JSONResponse({"error": "too_large"}, status_code=413)
        hint = body.get("hint_bank")
        return ai_client.label(text, hint if isinstance(hint, str) else None)

    @app.post("/v1/voice")
    async def voice(request: Request):
        t0 = time.perf_counter()
        if int(request.headers.get("content-length") or 0) > MAX_VOICE:
            return JSONResponse({"error": "too_large"}, status_code=413)
        data = await request.body()
        if not data or len(data) > MAX_VOICE:
            return JSONResponse({"error": "too_large" if data else "empty"}, status_code=413 if data else 400)
        cfg = sc.cfg["audio"]
        try:
            samples = decode(data)
        except Exception:
            return JSONResponse({"error": "undecodable_audio"}, status_code=400)
        score = sc.score_audio(samples)
        text, lang, ok = ai_client.transcribe(ai_client.wav_bytes(samples)) if samples.size else ("", None, False)
        del data, samples
        return {"transcript": text, "language": lang, "stt_ok": ok, "synthetic_score": score,
                "threshold": cfg.get("threshold", 0.7), "model_id": cfg.get("id"), "ms": int((time.perf_counter() - t0) * 1000)}

    @app.post("/v1/face")
    async def face(request: Request):
        t0 = time.perf_counter()
        if int(request.headers.get("content-length") or 0) > MAX_FACE_BODY:
            return JSONResponse({"error": "too_large"}, status_code=413)
        try:
            body = await request.json()
            frames = body.get("frames")
            assert isinstance(frames, list) and 0 < len(frames) <= 5
            images = decode_frames(frames)
        except ValueError:
            return JSONResponse({"error": "frame_too_large"}, status_code=413)
        except Exception:
            return JSONResponse({"error": "frames_required"}, status_code=400)
        crops, found = crop_faces(images)
        scores = sc.score_images(crops)
        valid = [s for s in scores if s is not None]
        cfg = sc.cfg["face"]
        return {"scores": scores, "synthetic_score": (round(sum(valid) / len(valid), 4) if valid else None), "faces_found": found,
                "threshold": cfg.get("threshold", 0.7), "model_id": cfg.get("id"), "ms": int((time.perf_counter() - t0) * 1000)}

    return app
