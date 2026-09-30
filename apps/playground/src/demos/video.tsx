import { useEffect, useRef, useState } from 'react';
import { assessFit, logRun } from '@front-brain/core';
import { useHardware, useLoadedModels } from '@front-brain/react';
import { createVisionTask, runVideoLoop, VISION_TASKS, type VisionKind, type VisionTask } from '@front-brain/mediapipe';
import { Card, ErrorBox, FitCard, Segmented } from '../components/ui';
import { VideoSource } from '../components/inputs';
import { DemoGrid } from '../components/DemoShell';
import { ModelPanel } from '../components/ModelPanel';
import { useDemo } from '../lib/useDemo';
import { UseInProject } from '../components/UseInProject';
import { mediapipeSnippets } from '../lib/snippets';
import { Boxes, CanvasImage } from './vision';

// ---------------------------------------------------------------- MediaPipe (real-time)
export function MediaPipeLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hw = useHardware();
  const loadedKeys = useLoadedModels().map((m) => m.key);
  const [kind, setKind] = useState<VisionKind>('face');
  const [delegate, setDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [task, setTask] = useState<VisionTask | null>(null);
  const [playing, setPlaying] = useState(false);
  const [stats, setStats] = useState<{ fps: number; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The task is dropped if someone unloads it from the dock / Models page.
  const alive = task && loadedKeys.includes(task.key) ? task : null;

  async function load(k = kind, d = delegate) {
    setLoading(true);
    setError(null);
    try {
      if (alive && (alive.kind !== k || !alive.key.endsWith(d))) alive.close();
      const t0 = performance.now();
      const t = await createVisionTask(k, { delegate: d });
      logRun({ demo: 'Live tracking', lib: 'mediapipe', model: k, device: d, loadMs: performance.now() - t0, note: 'load' });
      setTask(t);
      return t;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!alive || !playing) return;
    return runVideoLoop(videoRef.current!, canvasRef.current!, alive, setStats);
  }, [alive, playing]);

  useEffect(() => () => task?.close(), [task]);

  const fit = hw ? assessFit({ sizeMB: VISION_TASKS[kind].sizeMB, realtime: true }, hw, delegate === 'GPU' ? 'webgpu' : 'wasm') : null;
  const isCurrent = alive?.kind === kind && alive.key.endsWith(delegate);

  const aside = (
    <Card title="Model" className="model-panel">
      {(Object.keys(VISION_TASKS) as VisionKind[]).map((k) => (
        <button key={k} className={kind === k ? 'list-btn active' : 'list-btn'} onClick={() => setKind(k)}>
          <span>{VISION_TASKS[k].label}</span>
          <small className="hint">{VISION_TASKS[k].sizeMB} MB</small>
        </button>
      ))}
      <div className="field">
        <span className="field-label">Delegate</span>
        <Segmented value={delegate} onChange={setDelegate} options={[{ id: 'GPU', label: 'GPU (WebGL)' }, { id: 'CPU', label: 'CPU (WASM)' }]} />
      </div>
      <FitCard fit={fit} />
      <div className="load-state">
        <span className={`dot ${isCurrent ? 'ready' : loading ? 'loading' : 'idle'}`} />
        <span>{isCurrent ? 'Loaded' : loading ? 'Loading…' : alive ? `Holding: ${alive.kind}` : 'Not loaded – loads when video starts'}</span>
      </div>
      <div className="row">
        <button className="primary" disabled={loading || isCurrent} onClick={() => load()}>
          {isCurrent ? 'Loaded' : 'Load'}
        </button>
        <button disabled={!alive} onClick={() => alive?.close()}>
          Unload
        </button>
      </div>
      <UseInProject title={VISION_TASKS[kind].label} getSnippets={() => mediapipeSnippets(kind, delegate, VISION_TASKS[kind].model)} />
    </Card>
  );

  return (
    <DemoGrid aside={aside}>
      <Card title="Video">
        <VideoSource
          videoRef={videoRef}
          onReady={async () => {
            setPlaying(true);
            if (!isCurrent) await load();
          }}
          onStop={() => setPlaying(false)}
        />
        <div className="video-wrap">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
        </div>
        <div className="stats">
          {playing && stats && <span>{stats.fps} FPS</span>}
          {stats?.summary && <span>{stats.summary}</span>}
        </div>
        <ErrorBox error={error} />
      </Card>
    </DemoGrid>
  );
}

// ---------------------------------------------------------------- Transformers.js on video frames
type FrameTask = 'object-detection' | 'depth-estimation' | 'image-classification' | 'image-to-text';
const FRAME_TASKS: FrameTask[] = ['object-detection', 'depth-estimation', 'image-classification', 'image-to-text'];

export function TjsVideo() {
  const [task, setTask] = useState<FrameTask>('object-detection');
  return <TjsVideoInner key={task} task={task} setTask={setTask} />;
}

function TjsVideoInner({ task, setTask }: { task: FrameTask; setTask: (t: FrameTask) => void }) {
  const d = useDemo('Video frames', task);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fps, setFps] = useState<number | null>(null);
  const runRef = useRef(d.pipe.run);
  runRef.current = d.pipe.run;

  useEffect(() => {
    if (!on) return;
    let stop = false;
    const cnv = document.createElement('canvas');
    (async () => {
      while (!stop) {
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const scale = Math.min(1, 640 / v.videoWidth);
        cnv.width = v.videoWidth * scale;
        cnv.height = v.videoHeight * scale;
        cnv.getContext('2d')!.drawImage(v, 0, 0, cnv.width, cnv.height);
        const blob = await new Promise<Blob>((r) => cnv.toBlob((b) => r(b!), 'image/jpeg', 0.85));
        const url = URL.createObjectURL(blob);
        const t0 = performance.now();
        const opts = task === 'object-detection' ? { threshold: 0.6, percentage: true } : task === 'image-classification' ? { top_k: 3 } : {};
        const r = await runRef.current([url], opts, { quiet: true });
        URL.revokeObjectURL(url);
        if (r === undefined) break;
        if (!stop) {
          setResult(r);
          setFps(1000 / (performance.now() - t0));
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [on, task]);

  const flatR = result ? [result].flat(2) : [];
  return (
    <DemoGrid aside={<ModelPanel d={d} />}>
      <Card title="Video">
        <div className="row wrap">
          {FRAME_TASKS.map((t) => (
            <button key={t} className={task === t ? 'chip active' : 'chip'} onClick={() => setTask(t)}>
              {t}
            </button>
          ))}
        </div>
        <p className="hint">Runs the selected model on every frame, as fast as it can (frames downscaled to 640 px).</p>
        <VideoSource videoRef={videoRef} onReady={() => setOn(true)} onStop={() => setOn(false)} />
        <div className="grid2">
          <div className="video-wrap">
            <video ref={videoRef} playsInline muted />
            {task === 'object-detection' && result && (
              <div className="overlay">
                <Boxes items={flatR} />
              </div>
            )}
          </div>
          {task === 'depth-estimation' && result?.depth?.__image && <CanvasImage img={result.depth.__image} />}
        </div>
        <div className="stats">
          {fps != null && on && <span>{fps.toFixed(1)} FPS</span>}
          {task === 'image-classification' && flatR.map((c: any) => <span key={c.label}>{c.label} {(c.score * 100).toFixed(0)}%</span>)}
          {task === 'image-to-text' && flatR[0]?.generated_text && <span>{flatR[0].generated_text}</span>}
        </div>
        <ErrorBox error={d.pipe.error} />
      </Card>
    </DemoGrid>
  );
}

