"""Pick the deepfake models (Section 11.1), time-boxed.

Usage (from vivek/):  .venv/Scripts/python.exe eval/eval_models.py [--write] [--kind audio|face] [--models id1,id2]
Samples: eval/samples/{real,fake}/ with audio (.wav/.flac/.mp3) and images (.jpg/.png).
Images go through VIVEK's own crop_faces first, exactly as /v1/face does in production.
--models skips the Hub search and evaluates only the listed ids (plus the current one).
For each candidate: load on CPU (skip if it fails or takes > 3 s per item), print its labels, score
every sample, and count correct calls at the model's threshold. --write stores the best model with
>= 7/10 per kind in models.json; if none reaches it, the best is kept and marked "experimental".
The verdict never depends on these scores (the rules on the phone decide).
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from audio import decode  # noqa: E402
from scoring import crop_faces  # noqa: E402


def _arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None

AUDIO_EXT = (".wav", ".flac", ".mp3", ".ogg", ".m4a", ".opus")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")

# Explicit fake labels per known model (ASVspoof: 'spoof' is fake, 'bonafide' is real).
KNOWN_FAKE = {"fake", "spoof", "deepfake", "synthetic", "ai", "generated"}


def samples(kind):
    out = []
    for label in ("real", "fake"):
        d = os.path.join(HERE, "samples", label)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.lower().endswith(AUDIO_EXT if kind == "audio" else IMAGE_EXT):
                out.append((os.path.join(d, f), label))
    return out


def candidates(kind):
    from huggingface_hub import list_models
    seen, out = set(), []
    searches = ["deepfake audio", "anti-spoofing", "asvspoof", "audio deepfake detection"] if kind == "audio" else ["deepfake image", "deepfake face", "deepfake detector"]
    task = "audio-classification" if kind == "audio" else "image-classification"
    for q in searches:
        try:
            for m in list_models(search=q, sort="downloads", limit=10, pipeline_tag=task):
                if m.id not in seen:
                    seen.add(m.id)
                    out.append(m.id)
        except Exception as e:
            print("search failed:", q, e)
    return out[:12]


def evaluate(kind, model_id, items, threshold=0.7):
    from PIL import Image
    from transformers import pipeline
    t0 = time.time()
    try:
        clf = pipeline("audio-classification" if kind == "audio" else "image-classification", model=model_id, device=-1)
    except Exception as e:
        return {"id": model_id, "error": f"load: {str(e)[:80]}"}
    labels = list(getattr(clf.model.config, "id2label", {}).values())
    fake = [l for l in labels if str(l).lower() in KNOWN_FAKE]
    if not fake:
        return {"id": model_id, "labels": labels, "error": "no recognisable fake label"}
    correct, times, scores = 0, [], []
    for path, truth in items:
        t = time.time()
        try:
            if kind == "audio":
                x = decode(open(path, "rb").read())
                res = clf({"raw": x, "sampling_rate": 16000}, top_k=None)
            else:
                crops, _ = crop_faces([Image.open(path).convert("RGB")])
                res = clf(crops[0], top_k=None)
        except Exception as e:
            return {"id": model_id, "labels": labels, "error": f"infer: {str(e)[:80]}"}
        dt = time.time() - t
        times.append(dt)
        if dt > 3.0 and len(times) == 1 and dt > 6.0:
            return {"id": model_id, "labels": labels, "error": f"too slow ({dt:.1f}s/item)"}
        p = float(sum(r["score"] for r in res if r["label"] in fake))
        scores.append((os.path.basename(path), truth, round(p, 3)))
        if (p >= threshold) == (truth == "fake"):
            correct += 1
    return {"id": model_id, "labels": labels, "fake_labels": fake, "correct": correct, "total": len(items),
            "median_s": round(float(np.median(times)), 2) if times else None, "load_s": round(time.time() - t0, 1), "scores": scores}


def main():
    write = "--write" in sys.argv
    cfg_path = os.path.join(ROOT, "models.json")
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    report = []
    for kind in ([_arg("--kind")] if _arg("--kind") else ["audio", "face"]):
        items = samples(kind)
        if len(items) < 4:
            report.append(f"{kind}: not enough samples in eval/samples ({len(items)})")
            continue
        pool = _arg("--models").split(",") if _arg("--models") else candidates(kind)
        cands = [cfg[kind]["id"]] + [c for c in pool if c != cfg[kind]["id"]]
        results = []
        for mid in cands[:6]:
            r = evaluate(kind, mid, items, cfg[kind].get("threshold", 0.7))
            results.append(r)
            print(json.dumps({k: v for k, v in r.items() if k != "scores"}))
        ok = [r for r in results if "correct" in r]
        if not ok:
            report.append(f"{kind}: no candidate loaded")
            continue
        best = max(ok, key=lambda r: (r["correct"], -r["median_s"]))
        need = int(round(0.7 * best["total"]))
        status = "chosen" if best["correct"] >= need else "experimental signal"
        line = f"{kind}: {best['id']} {best['correct']}/{best['total']} correct at {cfg[kind].get('threshold', 0.7)} ({status}), median {best['median_s']} s/item"
        report.append(line)
        for s in best["scores"]:
            report.append(f"   {s[1]:4} {s[2]:.3f}  {s[0]}")
        if write:
            cfg[kind].update(id=best["id"], fake_labels=best["fake_labels"], eval=f"{best['correct']}/{best['total']} on eval/samples ({status}), {time.strftime('%Y-%m-%d')}")
    if write:
        json.dump(cfg, open(cfg_path, "w", encoding="utf-8"), indent=2)
    print("\n".join(report))


if __name__ == "__main__":
    main()
