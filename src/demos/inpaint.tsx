import { useEffect, useRef, useState } from 'react';
import { Card, ErrorBox, RunButton } from '../components/ui';
import { ImageInput, SAMPLE_IMAGES } from '../components/inputs';
import { hasWebGPU } from '../core/env';
import { inpaint, LAMA_SIZE } from '../core/lama';
import { logRun } from '../core/runlog';

const SIZE = LAMA_SIZE;

export function Inpaint() {
  const [img, setImg] = useState(SAMPLE_IMAGES[3].url);
  const [device, setDevice] = useState('wasm');
  const [gpu, setGpu] = useState(false);
  const [brush, setBrush] = useState(28);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stats, setStats] = useState<string | null>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    hasWebGPU().then((ok) => {
      setGpu(ok);
      if (ok) setDevice('webgpu');
    });
  }, []);

  // Load image into a fixed 512×512 canvas (model input size).
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      const s = Math.min(SIZE / im.width, SIZE / im.height);
      const w = im.width * s;
      const h = im.height * s;
      const ctx = baseRef.current!.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(im, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      maskRef.current!.getContext('2d')!.clearRect(0, 0, SIZE, SIZE);
    };
    im.src = img;
  }, [img]);

  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const c = maskRef.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE;
    const y = ((e.clientY - r.top) / r.height) * SIZE;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,0,80,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const base = baseRef.current!.getContext('2d')!.getImageData(0, 0, SIZE, SIZE);
      const mask = maskRef.current!.getContext('2d')!.getImageData(0, 0, SIZE, SIZE);
      const { image, loadMs, inferMs } = await inpaint(device as 'webgpu' | 'wasm', base, mask, setProgress);
      outRef.current!.getContext('2d')!.putImageData(image, 0, 0);
      setStats(`load ${loadMs > 50 ? (loadMs / 1000).toFixed(2) + ' s' : 'cached'} · inference ${inferMs.toFixed(0)} ms`);
      logRun({ demo: 'Inpainting (LaMa)', lib: 'onnxruntime-web', model: 'Carve/LaMa-ONNX', device, dtype: 'fp32', loadMs, inferMs });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <Card>
        <p className="hint">LaMa removes objects: paint over what should disappear, then run. Model: Carve/LaMa-ONNX (~200 MB, fp32) via raw onnxruntime-web.</p>
        <div className="picker">
          <label>
            Device
            <select value={device} onChange={(e) => setDevice(e.target.value)}>
              <option value="webgpu" disabled={!gpu}>WebGPU{gpu ? '' : ' (unavailable)'}</option>
              <option value="wasm">WASM (CPU)</option>
            </select>
          </label>
          <label>
            Brush {brush}px
            <input type="range" min={6} max={80} value={brush} onChange={(e) => setBrush(+e.target.value)} />
          </label>
        </div>
      </Card>
      <Card>
        <ImageInput value={img} onChange={setImg} />
        <div className="grid2">
          <div className="img-wrap paint">
            <canvas ref={baseRef} width={SIZE} height={SIZE} />
            <canvas
              ref={maskRef}
              width={SIZE}
              height={SIZE}
              className="overlay draw"
              onPointerDown={(e) => {
                drawing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                paint(e);
              }}
              onPointerMove={paint}
              onPointerUp={() => (drawing.current = false)}
            />
          </div>
          <canvas ref={outRef} width={SIZE} height={SIZE} className="result-img" />
        </div>
        <div className="row">
          <RunButton busy={busy} onClick={run} label="Inpaint" />
          <button onClick={() => maskRef.current!.getContext('2d')!.clearRect(0, 0, SIZE, SIZE)}>Clear mask</button>
          {stats && <div className="stats"><span>{stats}</span></div>}
        </div>
        {progress != null && <progress value={progress} max={1} />}
        <ErrorBox error={error} />
      </Card>
    </>
  );
}
