import { useEffect, useRef, useState } from 'react';

const DOCS = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/';
export const SAMPLE_IMAGES = [
  { label: 'Cats', url: DOCS + 'cats.jpg' },
  { label: 'Tiger', url: DOCS + 'tiger.jpg' },
  { label: 'Street', url: DOCS + 'city-streets.jpg' },
  { label: 'Football', url: DOCS + 'football-match.jpg' },
  { label: 'Butterfly', url: DOCS + 'butterfly.jpg' },
];
export const SAMPLE_AUDIO = [{ label: 'JFK (EN, 11 s)', url: DOCS + 'jfk.wav' }];

/** Image source picker: samples, upload, URL, clipboard paste. Returns a URL usable by the worker (http or blob:). */
export function ImageInput({ value, onChange, samples = SAMPLE_IMAGES }: { value: string; onChange: (url: string) => void; samples?: { label: string; url: string }[] }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) onChange(URL.createObjectURL(f));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onChange]);
  return (
    <div className="image-input">
      <div className="row wrap">
        {samples.map((s) => (
          <button key={s.url} className={value === s.url ? 'chip active' : 'chip'} onClick={() => onChange(s.url)}>
            {s.label}
          </button>
        ))}
        <label className="chip file">
          Upload…
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onChange(URL.createObjectURL(e.target.files[0]))} />
        </label>
      </div>
      <div className="row">
        <input placeholder="…or paste an image URL / Ctrl+V an image" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={() => url && onChange(url)}>Use URL</button>
      </div>
    </div>
  );
}

/** Audio picker: sample, upload, or microphone recording. Emits a Blob/URL plus a preview URL. */
export function AudioInput({ onChange, current }: { onChange: (src: { src: Blob | string; preview: string; label: string }) => void; current?: string }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function toggleRecord() {
    if (rec) {
      rec.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks.current, { type: r.mimeType });
      onChange({ src: blob, preview: URL.createObjectURL(blob), label: 'Recording' });
      setRec(null);
    };
    r.start();
    setRec(r);
  }

  return (
    <div className="stack">
      <div className="row wrap">
        {SAMPLE_AUDIO.map((s) => (
          <button key={s.url} className="chip" onClick={() => onChange({ src: s.url, preview: s.url, label: s.label })}>
            {s.label}
          </button>
        ))}
        <label className="chip file">
          Upload…
          <input
            type="file"
            accept="audio/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChange({ src: f, preview: URL.createObjectURL(f), label: f.name });
            }}
          />
        </label>
        <button className={rec ? 'chip danger' : 'chip'} onClick={toggleRecord}>
          {rec ? '■ Stop recording' : '● Record mic'}
        </button>
      </div>
      {current && <audio controls src={current} />}
    </div>
  );
}

/** Webcam or video file source. Calls back with the <video> element once it's playing. */
export function VideoSource({ videoRef, onReady }: { videoRef: React.RefObject<HTMLVideoElement | null>; onReady?: () => void }) {
  const [active, setActive] = useState<'cam' | 'file' | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopStream, []);

  async function startCam(facingMode: 'user' | 'environment') {
    stopStream();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    streamRef.current = stream;
    const v = videoRef.current!;
    v.removeAttribute('src');
    v.srcObject = stream;
    await v.play();
    setActive('cam');
    onReady?.();
  }

  async function useFile(f: File) {
    stopStream();
    const v = videoRef.current!;
    v.srcObject = null;
    v.src = URL.createObjectURL(f);
    v.loop = true;
    await v.play();
    setActive('file');
    onReady?.();
  }

  return (
    <div className="row wrap">
      <button className={active === 'cam' ? 'chip active' : 'chip'} onClick={() => startCam('user')}>
        Front camera
      </button>
      <button className="chip" onClick={() => startCam('environment')}>
        Back camera
      </button>
      <label className={active === 'file' ? 'chip file active' : 'chip file'}>
        Video file…
        <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && useFile(e.target.files[0])} />
      </label>
      {active && (
        <button
          className="chip"
          onClick={() => {
            stopStream();
            videoRef.current?.pause();
            setActive(null);
          }}
        >
          Stop
        </button>
      )}
    </div>
  );
}
