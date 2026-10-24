"""Deepfake classifiers we host (Section 8.9 / 11.1). Hugging Face pipelines whose ids, fake labels
and thresholds live in models.json. A missing or failing model gives score None, never an error:
the verdict always comes from the rules on the phone."""
import base64
import io
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_CFG_PATH = os.environ.get("VIVEK_MODELS", os.path.join(HERE, "models.json"))
if not os.path.exists(_CFG_PATH) and os.path.exists("/root/models.json"):
    _CFG_PATH = "/root/models.json"


def config():
    with open(_CFG_PATH, encoding="utf-8") as f:
        return json.load(f)


class Scorer:
    def __init__(self):
        self.cfg = config()
        self.audio = None
        self.face = None
        self.errors = {}

    def load(self):
        try:
            from transformers import pipeline
        except Exception as e:  # transformers/torch not installed: scores stay None
            self.errors["import"] = str(e)[:120]
            return self
        for kind in ("audio", "face"):
            c = self.cfg[kind]
            if not c.get("id"):
                continue
            try:
                setattr(self, kind, pipeline(c["task"], model=c["id"], device=-1))
            except Exception as e:
                self.errors[kind] = str(e)[:160]
        return self

    def status(self):
        return {k: {"id": self.cfg[k].get("id"), "loaded": getattr(self, k) is not None, "threshold": self.cfg[k].get("threshold", 0.7)}
                for k in ("audio", "face")}

    @staticmethod
    def _fake_prob(results, fake_labels):
        """Probability mass on the labels that mean 'fake' (ASVspoof: 'spoof' is fake, 'bonafide' is real)."""
        fl = {l.lower() for l in fake_labels}
        return float(sum(r["score"] for r in results if str(r["label"]).lower() in fl))

    def score_audio(self, samples: np.ndarray, rate=16000):
        if self.audio is None or samples.size == 0:
            return None
        c = self.cfg["audio"]
        try:
            res = self.audio({"raw": samples, "sampling_rate": rate}, top_k=None)
            return round(self._fake_prob(res, c["fake_labels"]), 4)
        except Exception:
            return None

    def score_images(self, images):
        if self.face is None or not images:
            return []
        c = self.cfg["face"]
        out = []
        for im in images:
            try:
                out.append(round(self._fake_prob(self.face(im, top_k=None), c["fake_labels"]), 4))
            except Exception:
                out.append(None)
        return out


def decode_frames(frames_b64, max_frames=5, max_bytes=300 * 1024):
    """b64 JPEG -> PIL images, size-limited before decoding."""
    from PIL import Image
    imgs = []
    for f in frames_b64[:max_frames]:
        raw = base64.b64decode(f, validate=False)
        if len(raw) > max_bytes:
            raise ValueError("frame over 300 KB")
        imgs.append(Image.open(io.BytesIO(raw)).convert("RGB"))
    return imgs


def crop_faces(images):
    """Largest face +20% (OpenCV Haar), else centre crop; resized to 224. Returns (crops, faces_found)."""
    from PIL import Image
    try:
        import cv2
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    except Exception:
        cv2 = None
        cascade = None
    crops, found = [], 0
    for im in images:
        w, h = im.size
        box = None
        if cascade is not None:
            gray = np.asarray(im.convert("L"))
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(32, 32))
            if len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                m = int(max(fw, fh) * 0.2)
                box = (max(0, x - m), max(0, y - m), min(w, x + fw + m), min(h, y + fh + m))
                found += 1
        if box is None:
            s = int(min(w, h) * 0.8)
            box = ((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)
        crops.append(im.crop(box).resize((224, 224), Image.BILINEAR))
    return crops, found
