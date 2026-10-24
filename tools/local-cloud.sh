#!/usr/bin/env bash
# SATYA's self-hosted AI on this laptop (Section 18 backup, no cloud accounts needed):
#   1. Qwen3-4B (Apache-2.0, official Qwen GGUF) on llama.cpp's OpenAI-compatible server, GPU via Vulkan, CPU fallback
#   2. VIVEK (FastAPI) with the deepfake classifiers, talking to that Qwen server
#   3. A Cloudflare quick tunnel (no login) so the phone and the Vercel gateway can reach VIVEK
# Usage: bash tools/local-cloud.sh          (Ctrl+C stops everything)
#        bash tools/local-cloud.sh --local  (no tunnel: Qwen + VIVEK on 127.0.0.1 only)
# Secrets are read from keys/server.json and written only to vivek/.env (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
L="${SATYA_LOCAL:-/d/satya-local}"
MODEL="$L/models/Qwen3-4B-Q4_K_M.gguf"
ALIAS="qwen3-4b"
LOGS="$L/logs"; mkdir -p "$LOGS"
LOCAL_ONLY=0; [ "${1:-}" = "--local" ] && LOCAL_ONLY=1

# Windows Python ends lines with CRLF; a stray CR in the key makes llama-server answer 401/400.
read -r APP_KEY AI_KEY < <(python -c "import json; k=json.load(open('keys/server.json')); print(k['app_key'], k['ai_api_key'])" | tr -d '[:cntrl:]'; echo)
cat > vivek/.env <<EOF
SATYA_APP_KEY=$APP_KEY
AI_BASE_URL=http://127.0.0.1:8081/v1
AI_API_KEY=$AI_KEY
AI_CHAT_MODEL=$ALIAS
AI_STT_MODEL=
EOF

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

start_llama() {
  local dir="$1"; shift
  "$L/$dir/llama-server.exe" -m "$MODEL" --alias "$ALIAS" --host 127.0.0.1 --port 8081 --api-key "$AI_KEY" \
    -c 4096 --parallel 2 --no-webui "$@" > "$LOGS/llama.log" 2>&1 &
  pids+=($!)
  local code=""
  for _ in $(seq 1 120); do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 -H "Authorization: Bearer $AI_KEY" http://127.0.0.1:8081/v1/models || true)
    [ "$code" = 200 ] && return 0
    kill -0 "${pids[-1]}" 2>/dev/null || { echo "      llama-server exited (last HTTP $code)"; return 1; }
    sleep 1
  done
  echo "      not ready after 120 s (last HTTP $code)"; return 1
}
echo "[1/3] Qwen on llama.cpp (GPU, Vulkan)…"
if ! start_llama llama-vulkan -ngl 99; then
  echo "      Vulkan failed, using the CPU build"; kill "${pids[-1]}" 2>/dev/null || true
  start_llama llama-cpu -t 6 || { echo "llama-server did not start; see $LOGS/llama.log"; exit 1; }
fi
echo "      http://127.0.0.1:8081/v1 ($ALIAS)"
# The first request compiles the GPU kernels (~20 s); pay that here, not on a user's first check.
curl -sf -m 120 -H "Authorization: Bearer $AI_KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$ALIAS\",\"max_tokens\":4,\"messages\":[{\"role\":\"user\",\"content\":\"hi /no_think\"}]}" \
  http://127.0.0.1:8081/v1/chat/completions >/dev/null 2>&1 && echo "      warmed up" || echo "      warm-up failed (first check will be slow)"

echo "[2/3] VIVEK…"
( cd vivek && set -a && . ./.env && set +a && exec .venv/Scripts/python.exe -m uvicorn app:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log ) > "$LOGS/vivek.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 120); do curl -sf -H "X-Satya-App: $APP_KEY" http://127.0.0.1:8000/health >/dev/null 2>&1 && break; sleep 1; done
echo "      http://127.0.0.1:8000"

if [ "$LOCAL_ONLY" = 1 ]; then echo "[3/3] Tunnel skipped (--local). Logs: $LOGS. Ctrl+C to stop."; wait; exit 0; fi
echo "[3/3] Cloudflare quick tunnel…"
"$L/bin/cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:8000 > "$LOGS/tunnel.log" 2>&1 &
pids+=($!)
URL=""
for _ in $(seq 1 60); do URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true); [ -n "$URL" ] && break; sleep 1; done
echo "$URL" > "$L/vivek-url.txt"
echo
echo "VIVEK is public at: $URL"
echo "  - Phone: Doctor -> Override URLs -> VIVEK = $URL"
echo "  - Gateway: printf '%s' $URL | vercel env add VIVEK_URL production --force && vercel deploy --prod (from web/)"
echo "Logs: $LOGS. Ctrl+C to stop."
wait
