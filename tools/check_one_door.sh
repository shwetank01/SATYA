#!/usr/bin/env bash
# Law 2 "one door out" (Section 8.3), checked at build time:
#  1. exactly one OkHttpClient is constructed in the app
#  2. no HttpURLConnection / URL(...).openConnection anywhere
#  3. KAVACH packets are constructed only inside android/app/.../kavach/
set -u
cd "$(dirname "$0")/.."
SRC=android/app/src/main
fail=0
n=$(grep -rnE "OkHttpClient\(\)|OkHttpClient\.Builder\(\)" "$SRC" | wc -l | tr -d ' ')
[ "$n" = "1" ] && echo "PASS  one OkHttpClient ($(grep -rlE 'OkHttpClient\.Builder\(\)|OkHttpClient\(\)' "$SRC"))" || { echo "FAIL  $n OkHttpClient constructions"; fail=1; }
if grep -rnE "HttpURLConnection|\.openConnection\(" "$SRC" >/dev/null; then echo "FAIL  raw HttpURLConnection / openConnection found:"; grep -rnE "HttpURLConnection|\.openConnection\(" "$SRC"; fail=1; else echo "PASS  no HttpURLConnection / openConnection"; fi
outside=$(grep -rnE "KavachPacket\.[A-Z][A-Za-z]+\(" "$SRC" | grep -v "/kavach/" || true)
[ -z "$outside" ] && echo "PASS  packets built only by KAVACH" || { echo "FAIL  packets constructed outside kavach/:"; echo "$outside"; fail=1; }
exit $fail
