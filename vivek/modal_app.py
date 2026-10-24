"""VIVEK on Modal (Section 11.2). Deploy: `cd vivek && modal deploy modal_app.py`.
Demo day: `SATYA_WARM=1 modal deploy modal_app.py`, back to 0 afterwards.
Secrets live in the Modal secret `satya-vivek` (SATYA_APP_KEY, AI_API_KEY, AI_BASE_URL, AI_CHAT_MODEL, AI_STT_MODEL)."""
import os

import modal

app = modal.App("satya-vivek")


def download_models():
    import json
    from transformers import pipeline
    cfg = json.load(open("/root/models.json"))
    for k in ("audio", "face"):
        if cfg[k]["id"]:
            pipeline(cfg[k]["task"], model=cfg[k]["id"])  # caches into HF_HOME at image build time


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("torch", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("transformers", "fastapi[standard]", "httpx", "numpy", "pillow", "av", "opencv-python-headless")
    .env({"HF_HOME": "/models"})
    .add_local_file("models.json", "/root/models.json", copy=True)
    .run_function(download_models)
    .add_local_python_source("app", "ai_client", "scoring", "masker", "audio")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("satya-vivek")],
    cpu=2.0,
    memory=4096,
    timeout=120,
    min_containers=int(os.environ.get("SATYA_WARM", "0")),
    scaledown_window=600,
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    from app import create_app
    return create_app()
