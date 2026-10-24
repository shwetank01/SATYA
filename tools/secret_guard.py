"""Block commits that contain a real secret.

The repo is public. This guard does not guess: it loads every secret value
that exists on this machine (from the gitignored key and env files) and fails
if any staged file contains one of them. It also rejects a few unmistakable
generic patterns (private key blocks, provider API key prefixes).

Run by tools/githooks/pre-commit. Manual run: python tools/secret_guard.py
"""
import json
import os
import re
import subprocess
import sys

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or "."

SECRET_NAME = re.compile(r"(SECRET|_SK\b|_SK_|PRIVATE|PASSWORD|PASS\b|TOKEN|API_KEY|APP_KEY|SERVICE_ROLE|SEED|STORE_PASSWORD|KEY_PASSWORD)", re.I)
PUBLIC_NAME = re.compile(r"(_PK\b|PUBLIC|ANON|_URL\b|NEXT_PUBLIC)", re.I)
GENERIC = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key block"),
    (re.compile(r"\bgsk_[A-Za-z0-9]{20,}"), "Groq API key"),
    (re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}"), "OpenAI-style API key"),
    (re.compile(r"\bhf_[A-Za-z0-9]{30,}"), "Hugging Face token"),
    (re.compile(r"\bsbp_[a-f0-9]{30,}"), "Supabase access token"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"), "GitHub token"),
    (re.compile(r"\bsk_[a-z0-9]{8}_[A-Za-z0-9]{16,}"), "Sarvam AI API key"),
    (re.compile(r"\bvercel_blob_rw_[A-Za-z0-9_]{16,}"), "Vercel Blob token"),
]
SECRET_FILES = [
    "android/secrets.properties", "android/keystore.properties",
    "ai-worker/.dev.vars", "setu/.dev.vars",
]


def collect_secret_values():
    vals = set()

    def add(v):
        if isinstance(v, str) and len(v) >= 16:
            vals.add(v)

    def walk_json(obj, key=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk_json(v, k)
        elif isinstance(obj, list):
            for v in obj:
                walk_json(v, key)
        elif isinstance(obj, str):
            k = key.lower()
            if (k == "sk" or k.endswith("_sk") or k.endswith("sk64") or k.endswith("key") or any(w in k for w in ("secret", "seed", "private", "password", "token"))) and not k.endswith("_pk"):
                add(obj)

    keys_dir = os.path.join(ROOT, "keys")
    if os.path.isdir(keys_dir):
        for name in os.listdir(keys_dir):
            path = os.path.join(keys_dir, name)
            if name.endswith(".json"):
                try:
                    walk_json(json.load(open(path, encoding="utf-8")))
                except Exception:
                    pass
    env_files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", ".next", "build", ".gradle", ".venv")]
        for f in filenames:
            if f == ".env" or (f.startswith(".env.") and not f.endswith(".example")) or f == ".dev.vars":
                env_files.append(os.path.join(dirpath, f))
    env_files += [os.path.join(ROOT, p) for p in SECRET_FILES]
    sec_dir = os.path.join(ROOT, "tools", ".secrets")
    if os.path.isdir(sec_dir):
        env_files += [os.path.join(sec_dir, f) for f in os.listdir(sec_dir)]
    for path in env_files:
        if not os.path.isfile(path):
            continue
        for line in open(path, encoding="utf-8", errors="ignore"):
            m = re.match(r"\s*(?:export\s+)?([A-Za-z0-9_.]+)\s*[=:]\s*(.+?)\s*$", line)
            if not m:
                continue
            name, value = m.group(1), m.group(2).strip().strip('"').strip("'")
            if SECRET_NAME.search(name) and not PUBLIC_NAME.search(name):
                add(value)
    return vals


def staged_files():
    out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
                         capture_output=True, cwd=ROOT).stdout.decode("utf-8", "ignore")
    return [p for p in out.split("\0") if p]


def staged_text(path):
    blob = subprocess.run(["git", "show", ":" + path], capture_output=True, cwd=ROOT).stdout
    if b"\0" in blob[:8000]:
        return None  # binary
    return blob.decode("utf-8", "ignore")


def main():
    secrets = collect_secret_values()
    problems = []
    for path in staged_files():
        low = path.lower().replace("\\", "/")
        if low.startswith("keys/") or low.endswith((".jks", ".keystore", ".p12")) or os.path.basename(low) in (".env", ".dev.vars", "secrets.properties", "keystore.properties", "demo_keys.json"):
            problems.append(f"{path}: secret file must never be committed")
            continue
        text = staged_text(path)
        if text is None:
            continue
        for v in secrets:
            if v in text:
                problems.append(f"{path}: contains a real secret value ({v[:4]}…{len(v)} chars)")
        for rx, label in GENERIC:
            if rx.search(text):
                problems.append(f"{path}: looks like a {label}")
    if problems:
        print("SECRET GUARD: commit blocked")
        for p in sorted(set(problems)):
            print("  -", p)
        sys.exit(1)
    print(f"secret guard: ok ({len(secrets)} known secrets checked)")


if __name__ == "__main__":
    main()
