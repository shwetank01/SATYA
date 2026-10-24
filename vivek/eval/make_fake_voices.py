"""Generate the synthetic ("fake") voice samples for eval_models.py with Piper TTS (open source).

Usage (from vivek/):  .venv/Scripts/python.exe eval/make_fake_voices.py <dir with Piper .onnx voices>
Writes eval/samples/fake/voice_<voice>_<n>.wav (gitignored). Piper is an eval-time tool only;
it is not a VIVEK dependency and is not in requirements.txt.
"""
import os
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "samples", "fake")

SCRIPTS = {
    "en": [
        "Hello sir, I am calling from the State Bank fraud department. Someone is trying to use your card. Please tell me the six digit code you just received so I can block it.",
        "This is the RBI verification desk. Your account is under investigation. Move your balance to the safe account I will give you, for twenty four hours only.",
        "Madam, your KYC has expired and your account will be frozen today. Install the support app from the link I sent and share your screen with our officer.",
    ],
    "hi": [
        "नमस्ते, मैं बैंक से बोल रहा हूँ। आपके कार्ड पर धोखाधड़ी हुई है। अभी जो ओटीपी आया है वो मुझे बताइए।",
        "आपका खाता आज बंद हो जाएगा। केवाईसी अपडेट करने के लिए दस रुपये की फ़ीस इस नंबर पर भेजिए।",
    ],
}


def main():
    from piper import PiperVoice
    src = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for f in sorted(os.listdir(src)):
        if not f.endswith(".onnx"):
            continue
        lang = f.split("_")[0]
        voice = PiperVoice.load(os.path.join(src, f))
        name = f.split("-")[1]
        for i, text in enumerate(SCRIPTS.get(lang, [])):
            path = os.path.join(OUT, f"voice_{name}_{i + 1}.wav")
            with wave.open(path, "wb") as w:
                voice.synthesize_wav(text, w)
            n += 1
            print(path)
    print(f"{n} files")


if __name__ == "__main__":
    main()
