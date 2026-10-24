"""Audio decoding in memory (Section 8.9): any container/codec PyAV can read -> mono float32,
16 kHz, first 30 s. Nothing touches the disk."""
import io

import numpy as np

RATE = 16000
MAX_SECONDS = 30


def decode(data: bytes) -> np.ndarray:
    try:
        import av
    except ImportError:  # local runs without PyAV still handle plain WAV
        return _decode_wav(data)
    with av.open(io.BytesIO(data)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError("no audio stream")
        resampler = av.AudioResampler(format="flt", layout="mono", rate=RATE)
        chunks = []
        total = 0
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                arr = out.to_ndarray().reshape(-1).astype(np.float32)
                chunks.append(arr)
                total += arr.size
            if total >= RATE * MAX_SECONDS:
                break
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1).astype(np.float32))
    audio = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
    return audio[: RATE * MAX_SECONDS]


def _decode_wav(data: bytes) -> np.ndarray:
    import wave
    with wave.open(io.BytesIO(data)) as w:
        rate, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(min(w.getnframes(), rate * MAX_SECONDS))
    if width != 2:
        raise ValueError("only 16-bit WAV without PyAV")
    x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if rate != RATE and x.size:
        idx = np.linspace(0, x.size - 1, int(x.size * RATE / rate))
        x = np.interp(idx, np.arange(x.size), x).astype(np.float32)
    return x
