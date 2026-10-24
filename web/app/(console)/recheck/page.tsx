'use client';
import { useState } from 'react';
import { Shell } from '@/components/ui';
import { api } from '@/lib/console/client';

/** Five frames from a video file, 512 px wide, via <video> + canvas, entirely in the browser. */
async function videoFrames(file: File, n = 5): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true;
  await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = j; });
  const out: string[] = [];
  const c = document.createElement('canvas');
  for (let i = 0; i < n; i++) {
    v.currentTime = (v.duration * (i + 0.5)) / n;
    await new Promise((r) => { v.onseeked = r; });
    const w = 512; c.width = w; c.height = Math.round((v.videoHeight / v.videoWidth) * w);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    out.push(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
  }
  URL.revokeObjectURL(url);
  return out;
}

async function imageFrame(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  const w = Math.min(768, bmp.width); c.width = w; c.height = Math.round((bmp.height / bmp.width) * w);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

/** I4 Deepfake Re-check: a score is a signal, never a verdict. */
export default function Recheck() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  async function run(file: File) {
    setBusy(true); setErr(''); setRes(null);
    try {
      if (file.type.startsWith('audio/')) {
        if (file.size > 4 * 1024 * 1024) throw new Error('Audio over 4 MB: trim it first.');
        setRes({ kind: 'voice', name: file.name, ...(await api('/vivek/voice', { method: 'POST', body: await file.arrayBuffer(), headers: { 'content-type': file.type } })) });
      } else {
        const frames = file.type.startsWith('video/') ? await videoFrames(file) : [await imageFrame(file)];
        setRes({ kind: 'face', name: file.name, ...(await api('/vivek/face', { method: 'POST', body: JSON.stringify({ frames }) })) });
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const score = res?.synthetic_score;
  return (
    <Shell title="Deepfake Re-check" sub="Upload audio, video or an image found elsewhere (a fake CEO clip, a cloned voice). Video is sampled into 5 frames in this browser.">
      <label className={`card flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-blue/30 p-10 text-center ${busy ? 'opacity-60' : ''}`}>
        <span className="font-display text-xl font-semibold text-blue">{busy ? 'Scoring…' : 'Choose a file'}</span>
        <span className="text-sm text-muted">Audio (≤ 4 MB), video or image</span>
        <input type="file" className="hidden" accept="audio/*,video/*,image/*" disabled={busy} onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
      </label>
      {err && <p className="mt-4 font-semibold">{err}</p>}
      {res && (
        <div className="card card-in mt-5 p-6">
          <div className="micro">{res.kind === 'voice' ? 'Synthetic-voice score' : 'Synthetic-face score'} · {res.name}</div>
          <div className="mt-2 flex items-end gap-4">
            <span className="font-display text-6xl font-light">{score == null ? '—' : Math.round(score * 100) + '%'}</span>
            <span className="stamp mb-2">{score == null ? 'No score' : score >= (res.threshold ?? 0.7) ? 'Above threshold' : 'Below threshold'}</span>
          </div>
          <p className="mt-2 text-sm text-body2">Threshold {Math.round((res.threshold ?? 0.7) * 100)}% · model {res.model_id ?? 'none loaded'}{res.faces_found != null ? ` · faces found ${res.faces_found}` : ''} · {res.ms} ms. A signal, not proof: decide on what the message asks for.</p>
          {res.transcript && <><div className="micro mt-4">Transcript</div><p className="mt-1 rounded-xl bg-paper p-3">{res.transcript}</p></>}
        </div>
      )}
    </Shell>
  );
}
