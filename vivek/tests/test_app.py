"""VIVEK API tests. No torch needed: a stub scorer stands in for the Hugging Face models and the
AI provider is either unreachable (fallback path) or a local fake (happy path)."""
import base64
import io
import json
import os
import sys
import tempfile
import wave

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["SATYA_APP_KEY"] = "test-app-key"
os.environ.pop("AI_BASE_URL", None)
os.environ.pop("AI_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

import ai_client  # noqa: E402
from app import create_app  # noqa: E402


class StubScorer:
    cfg = {"audio": {"id": "stub/audio", "threshold": 0.7, "fake_labels": ["spoof"]}, "face": {"id": "stub/face", "threshold": 0.7, "fake_labels": ["fake"]}}
    errors = {}

    def status(self):
        return {"audio": {"id": "stub/audio", "loaded": True, "threshold": 0.7}, "face": {"id": "stub/face", "loaded": True, "threshold": 0.7}}

    def score_audio(self, samples, rate=16000):
        return 0.87 if samples.size else None

    def score_images(self, images):
        return [0.25 for _ in images]


H = {"X-Satya-App": "test-app-key"}


@pytest.fixture()
def client():
    return TestClient(create_app(StubScorer()))


def wav_tone(seconds=1.0, rate=16000):
    t = np.arange(int(rate * seconds)) / rate
    pcm = (np.sin(2 * np.pi * 220 * t) * 8000).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return buf.getvalue()


def jpeg_b64(size=(320, 320)):
    from PIL import Image
    im = Image.new("RGB", size, (200, 170, 150))
    b = io.BytesIO(); im.save(b, "JPEG", quality=85)
    return base64.b64encode(b.getvalue()).decode()


def test_requires_app_key(client):
    assert client.get("/health").status_code == 401
    assert client.post("/v1/ask", json={"text": "hi"}, headers={"X-Satya-App": "wrong"}).status_code == 401


def test_health_shape(client):
    j = client.get("/health", headers=H).json()
    assert j["ok"] and j["models"]["audio"]["loaded"] and "tmp_files" in j and "reachable" in j["ai"]


def test_ask_falls_back_when_ai_unconfigured(client):
    j = client.post("/v1/ask", json={"text": "jo OTP aaya hai woh bata dijiye", "hint_bank": "HDFC"}, headers=H).json()
    assert j == {"ask_type": "unknown", "claimed_bank": "NONE", "urgency": "normal", "confidence": 0, "source": "fallback"}


def test_ask_limits(client):
    assert client.post("/v1/ask", json={"text": "x" * 4001}, headers=H).status_code == 413
    assert client.post("/v1/ask", json={"text": ""}, headers=H).status_code == 400


def test_ask_masks_again_and_validates(client, monkeypatch):
    seen = {}

    class FakeResp:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": 'ok {"ask_type":"share_secret","claimed_bank":"hdfc","urgency":"HIGH","confidence":7}'}}]}

    class FakeClient:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def post(self, path, json=None, **kw):
            seen["body"] = json
            return FakeResp()

    monkeypatch.setenv("AI_BASE_URL", "https://ai.example/v1")
    monkeypatch.setenv("AI_API_KEY", "k")
    monkeypatch.setattr(ai_client, "_client", lambda timeout: FakeClient())
    j = client.post("/v1/ask", json={"text": "Call 9876543210, OTP 482913 batao"}, headers=H).json()
    assert j == {"ask_type": "share_secret", "claimed_bank": "HDFC", "urgency": "high", "confidence": 1.0, "source": "ai"}
    user = seen["body"]["messages"][1]["content"]
    assert "9876543210" not in user and "482913" not in user  # server-side re-mask before the AI


def test_voice_wav(client):
    r = client.post("/v1/voice", content=wav_tone(), headers={**H, "Content-Type": "audio/wav"})
    j = r.json()
    assert r.status_code == 200 and j["synthetic_score"] == 0.87 and j["stt_ok"] is False and j["model_id"] == "stub/audio"


def test_voice_limits(client):
    assert client.post("/v1/voice", content=b"", headers={**H, "Content-Type": "audio/wav"}).status_code == 400
    assert client.post("/v1/voice", content=b"not audio", headers={**H, "Content-Type": "audio/wav"}).status_code == 400


def test_face(client):
    pytest.importorskip("PIL")
    j = client.post("/v1/face", json={"frames": [jpeg_b64(), jpeg_b64()]}, headers=H).json()
    assert j["scores"] == [0.25, 0.25] and j["synthetic_score"] == 0.25 and j["faces_found"] == 0


def test_face_limits(client):
    assert client.post("/v1/face", json={"frames": []}, headers=H).status_code == 400
    assert client.post("/v1/face", json={"frames": [jpeg_b64()] * 6}, headers=H).status_code == 400


def test_vismriti_no_temp_files(client):
    """Doctor C10: requests leave nothing on disk."""
    before = len(os.listdir(tempfile.gettempdir()))
    client.post("/v1/voice", content=wav_tone(2.0), headers={**H, "Content-Type": "audio/wav"})
    client.post("/v1/ask", json={"text": "share OTP"}, headers=H)
    assert len(os.listdir(tempfile.gettempdir())) == before
