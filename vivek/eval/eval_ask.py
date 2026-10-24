"""Score a chat model on eval/ask_cases.json through VIVEK's own client (same prompt, parsing,
validation and fallback the phone gets). Usage, from vivek/ with AI_* env set:
    python eval/eval_ask.py            -> accuracy, bank accuracy, JSON validity, latency
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import ai_client  # noqa: E402

cases = json.load(open(os.path.join(HERE, "ask_cases.json"), encoding="utf-8"))["cases"]
ai_client.label("warm up", None)  # first call compiles GPU kernels; not counted
ok = bank_ok = fallback = 0
times = []
for c in cases:
    t = time.time()
    r = ai_client.label(c["text"], None)
    dt = time.time() - t
    times.append(dt)
    hit = r["ask_type"] == c["ask_type"]
    ok += hit
    bank_ok += r["claimed_bank"] == c["bank"]
    fallback += r["source"] == "fallback"
    print(("OK " if hit else "XX ") + f"{r['ask_type']:13} want {c['ask_type']:13} bank {r['claimed_bank']:5}/{c['bank']:5} {dt:5.2f}s  {c['text'][:60]}")
times.sort()
n = len(cases)
print(f"\nmodel {os.environ.get('AI_CHAT_MODEL')}: ask {ok}/{n} ({ok * 100 // n}%), bank {bank_ok}/{n}, fallbacks {fallback}, median {times[n // 2]:.2f}s, p90 {times[int(n * .9)]:.2f}s")
