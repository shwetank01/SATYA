#!/usr/bin/env bash
# Backup compute (Section 18): VIVEK on this laptop, published through a Cloudflare quick tunnel.
# Prints an https://*.trycloudflare.com URL: put it in the Doctor "Override URLs" box and in Vercel VIVEK_URL.
set -euo pipefail
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
uvicorn app:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log &
UV=$!
trap 'kill $UV 2>/dev/null' EXIT
sleep 3
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000
