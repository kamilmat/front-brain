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

/**
 * Creates object URLs and revokes them all on unmount. Earlier URLs are kept alive on purpose:
 * a run started with image A may still be waiting for the model to load when image B is picked.
 */
function useObjectUrl() {
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    },
    [],
  );
  return (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.push(u);
    return u;
  };
}

/** Keyboard-accessible file picker: a real button that opens a hidden file input. */
function FilePicker({ label, accept, onFile, className = 'chip' }: { label: string; accept: string; onFile: (f: File) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = ''; // allow picking the same file again
        }}
      />
    </>
  );
}

const mediaError = (e: unknown) => {
  const err = e as DOMException;
  if (err?.name === 'NotAllowedError') return 'Permission denied – allow camera/microphone access for this site.';
  if (err?.name === 'NotFoundError') return 'No camera/microphone found.';
  return err?.message || String(e);
};

/** Image source picker: samples, upload, URL, clipboard paste. Returns a URL usable by the worker (http or blob:). */
export function ImageInput({ value, onChange, samples = SAMPLE_IMAGES }: { value: string; onChange: (url: string) => void; samples?: { label: string; url: string }[] }) {
  const [url, setUrl] = useState('');
  const toUrl = useObjectUrl();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) onChangeRef.current(toUrl(f));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="image-input">
      <div className="row wrap">
        {samples.map((s) => (
          <button key={s.url} className={value === s.url ? 'chip active' : 'chip'} onClick={() => onChange(s.url)}>
            {s.label}
          </button>
        ))}
        <FilePicker label="Upload…" accept="image/*" onFile={(f) => onChange(toUrl(f))} />
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
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  /** getUserMedia in progress – ignore further clicks so we never open two streams. */
  const starting = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const mounted = useRef(true);
  const toUrl = useObjectUrl();

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  // Leaving the page while recording must release the microphone.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recRef.current?.state === 'recording') recRef.current.stop();
      stopTracks();
    };
  }, []);

  async function toggleRecord() {
    if (recRef.current?.state === 'recording') {
      recRef.current.stop();
      return;
    }
    if (starting.current) return;
    starting.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => {
        stopTracks();
        recRef.current = null;
        if (!mounted.current) return;
        const blob = new Blob(chunks.current, { type: r.mimeType });
        onChange({ src: blob, preview: toUrl(blob), label: 'Recording' });
        setRecording(false);
      };
      r.start();
      recRef.current = r;
      setRecording(true);
    } catch (e) {
      stopTracks();
      setError(mediaError(e));
    } finally {
      starting.current = false;
    }
  }

  return (
    <div className="stack">
      <div className="row wrap">
        {SAMPLE_AUDIO.map((s) => (
          <button key={s.url} className="chip" onClick={() => onChange({ src: s.url, preview: s.url, label: s.label })}>
            {s.label}
          </button>
        ))}
        <FilePicker label="Upload…" accept="audio/*,video/*" onFile={(f) => onChange({ src: f, preview: toUrl(f), label: f.name })} />
        <button className={recording ? 'chip danger' : 'chip'} onClick={toggleRecord}>
          {recording ? '■ Stop recording' : '● Record mic'}
        </button>
      </div>
      {error && <pre className="error">{error}</pre>}
      {current && <audio controls src={current} />}
    </div>
  );
}

/** Webcam or video file source. Calls back once the <video> element is playing. */
export function VideoSource({ videoRef, onReady, onStop }: { videoRef: React.RefObject<HTMLVideoElement | null>; onReady?: () => void; onStop?: () => void }) {
  const [active, setActive] = useState<'cam' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Bumped by every start/stop – a slower, older getUserMedia result is discarded. */
  const request = useRef(0);
  const toUrl = useObjectUrl();

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(
    () => () => {
      request.current++;
      stopStream();
    },
    [],
  );

  async function startCam(facingMode: 'user' | 'environment') {
    const req = ++request.current;
    stopStream();
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const v = videoRef.current;
      if (req !== request.current || !v) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      v.removeAttribute('src');
      v.srcObject = stream;
      await v.play();
      setActive('cam');
      onReady?.();
    } catch (e) {
      if (req === request.current) setError(mediaError(e));
    }
  }

  async function playFile(f: File) {
    const req = ++request.current;
    stopStream();
    setError(null);
    const v = videoRef.current;
    if (!v) return;
    try {
      v.srcObject = null;
      v.src = toUrl(f);
      v.loop = true;
      await v.play();
      if (req !== request.current) return;
      setActive('file');
      onReady?.();
    } catch (e) {
      if (req === request.current) setError((e as Error).message);
    }
  }

  return (
    <div className="stack">
      <div className="row wrap">
        <button className={active === 'cam' ? 'chip active' : 'chip'} onClick={() => startCam('user')}>
          Front camera
        </button>
        <button className="chip" onClick={() => startCam('environment')}>
          Back camera
        </button>
        <FilePicker label="Video file…" accept="video/*" className={active === 'file' ? 'chip active' : 'chip'} onFile={playFile} />
        {active && (
          <button
            className="chip"
            onClick={() => {
              request.current++;
              stopStream();
              videoRef.current?.pause();
              setActive(null);
              onStop?.();
            }}
          >
            Stop
          </button>
        )}
      </div>
      {error && <pre className="error">{error}</pre>}
    </div>
  );
}
