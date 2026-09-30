import { useEffect, useRef, useState } from 'react';
import { Card, ErrorBox, ModelPicker, Progress } from '../components/ui';
import { VideoSource } from '../components/inputs';
import { useModelChoice, useTjs, type ModelPreset } from '../react/useTjs';
import { logRun } from '../core/runlog';
import { Boxes, CanvasImage } from './vision';

// ---------------------------------------------------------------- MediaPipe (real-time)
const MP_VERSION = '1.0.1';
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP = 'https://storage.googleapis.com/mediapipe-models/';

type MpTask = 'face' | 'hand' | 'pose' | 'gesture' | 'object' | 'selfie';
const MP_TASKS: Record<MpTask, { label: string; model: string }> = {
  face: { label: 'Face landmarks (478 pts)', model: MP + 'face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
  hand: { label: 'Hand landmarks', model: MP + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
  pose: { label: 'Pose (body)', model: MP + 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
  gesture: { label: 'Gesture recognition', model: MP + 'gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task' },
  object: { label: 'Object detection (EfficientDet)', model: MP + 'object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite' },
  selfie: { label: 'Selfie segmentation', model: MP + 'image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
};

export function MediaPipeLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [task, setTask] = useState<MpTask>('face');
  const [delegate, setDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [fps, setFps] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    let stop = false;
    let raf = 0;
    let runner: any;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const v = await import('@mediapipe/tasks-vision');
        const fileset = await v.FilesetResolver.forVisionTasks(MP_WASM);
        const t0 = performance.now();
        const base = { baseOptions: { modelAssetPath: MP_TASKS[task].model, delegate }, runningMode: 'VIDEO' as const };
        runner =
          task === 'face' ? await v.FaceLandmarker.createFromOptions(fileset, { ...base, numFaces: 2, outputFaceBlendshapes: true })
          : task === 'hand' ? await v.HandLandmarker.createFromOptions(fileset, { ...base, numHands: 2 })
          : task === 'pose' ? await v.PoseLandmarker.createFromOptions(fileset, { ...base, numPoses: 2 })
          : task === 'gesture' ? await v.GestureRecognizer.createFromOptions(fileset, { ...base, numHands: 2 })
          : task === 'object' ? await v.ObjectDetector.createFromOptions(fileset, { ...base, scoreThreshold: 0.4, maxResults: 10 })
          : await v.ImageSegmenter.createFromOptions(fileset, { ...base, outputCategoryMask: true, outputConfidenceMasks: false });
        logRun({ demo: 'MediaPipe live', lib: 'mediapipe', model: task, device: delegate, loadMs: performance.now() - t0, note: 'load' });
        setLoading(false);
        const video = videoRef.current!;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        const draw = new v.DrawingUtils(ctx);
        let frames = 0;
        let lastFps = performance.now();
        let lastT = -1;
        const loop = () => {
          if (stop) return;
          raf = requestAnimationFrame(loop);
          if (video.readyState < 2 || video.currentTime === lastT) return;
          lastT = video.currentTime;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const now = performance.now();
          const r = task === 'gesture' ? runner.recognizeForVideo(video, now) : task === 'selfie' ? runner.segmentForVideo(video, now) : runner.detectForVideo(video, now);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (task === 'face') {
            for (const lm of r.faceLandmarks) {
              draw.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#C0C0C070', lineWidth: 1 });
              draw.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF3030' });
              draw.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#30FF30' });
              draw.drawConnectors(lm, v.FaceLandmarker.FACE_LANDMARKS_LIPS, { color: '#E0E0E0' });
            }
            const bs = r.faceBlendshapes?.[0]?.categories ?? [];
            setInfo(bs.filter((c: any) => c.score > 0.4).sort((a: any, b: any) => b.score - a.score).slice(0, 5).map((c: any) => `${c.categoryName} ${(c.score * 100).toFixed(0)}%`).join(' · '));
          } else if (task === 'hand' || task === 'gesture') {
            for (const lm of r.landmarks) {
              draw.drawConnectors(lm, v.HandLandmarker.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
              draw.drawLandmarks(lm, { color: '#FF0000', lineWidth: 1 });
            }
            if (task === 'gesture') setInfo(r.gestures.map((g: any) => `${g[0].categoryName} ${(g[0].score * 100).toFixed(0)}%`).join(' · '));
          } else if (task === 'pose') {
            for (const lm of r.landmarks) {
              draw.drawConnectors(lm, v.PoseLandmarker.POSE_CONNECTIONS, { color: '#00E0FF', lineWidth: 3 });
              draw.drawLandmarks(lm, { color: '#FF00AA', radius: 3 });
            }
          } else if (task === 'object') {
            ctx.lineWidth = 3;
            ctx.font = '18px sans-serif';
            for (const det of r.detections) {
              const b = det.boundingBox;
              ctx.strokeStyle = ctx.fillStyle = '#00FF88';
              ctx.strokeRect(b.originX, b.originY, b.width, b.height);
              const c = det.categories[0];
              ctx.fillText(`${c.categoryName} ${(c.score * 100).toFixed(0)}%`, b.originX + 4, b.originY + 20);
            }
          } else if (task === 'selfie' && r.categoryMask) {
            const mask = r.categoryMask.getAsUint8Array();
            const img = ctx.createImageData(canvas.width, canvas.height);
            for (let i = 0; i < mask.length; i++) {
              // selfie_segmenter: 0 = person… values vary per model – shade background
              if (mask[i] === 0) {
                img.data[i * 4] = 0;
                img.data[i * 4 + 1] = 120;
                img.data[i * 4 + 2] = 255;
                img.data[i * 4 + 3] = 140;
              }
            }
            ctx.putImageData(img, 0, 0);
            r.close?.();
          }
          frames++;
          if (now - lastFps > 1000) {
            setFps(Math.round((frames * 1000) / (now - lastFps)));
            frames = 0;
            lastFps = now;
          }
        };
        loop();
      } catch (e) {
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      runner?.close();
    };
  }, [running, task, delegate]);

  return (
    <>
      <Card>
        <div className="row wrap">
          {(Object.keys(MP_TASKS) as MpTask[]).map((t) => (
            <button key={t} className={task === t ? 'chip active' : 'chip'} onClick={() => setTask(t)}>
              {MP_TASKS[t].label}
            </button>
          ))}
        </div>
        <div className="picker">
          <label>
            Delegate
            <select value={delegate} onChange={(e) => setDelegate(e.target.value as 'GPU' | 'CPU')}>
              <option value="GPU">GPU (WebGL)</option>
              <option value="CPU">CPU (WASM)</option>
            </select>
          </label>
        </div>
        <p className="hint">Google MediaPipe Tasks – tiny models (3–10 MB) built for real-time use, works well on phones.</p>
      </Card>
      <Card>
        <VideoSource videoRef={videoRef} onReady={() => setRunning(true)} />
        <div className="video-wrap">
          <video ref={videoRef} playsInline muted />
          <canvas ref={canvasRef} />
        </div>
        <div className="stats">
          {loading && <span>Loading model…</span>}
          {running && !loading && <span>{fps} FPS</span>}
          {info && <span>{info}</span>}
        </div>
        <ErrorBox error={error} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Transformers.js on video frames
type FrameTask = 'object-detection' | 'depth-estimation' | 'image-classification' | 'image-to-text';
const FRAME_PRESETS: Record<FrameTask, ModelPreset[]> = {
  'object-detection': [{ id: 'Xenova/yolos-tiny', mobile: true }, { id: 'Xenova/detr-resnet-50' }],
  'depth-estimation': [{ id: 'onnx-community/depth-anything-v2-small', mobile: true }],
  'image-classification': [{ id: 'Xenova/vit-base-patch16-224', mobile: true }, { id: 'Xenova/resnet-50', mobile: true }],
  'image-to-text': [{ id: 'Xenova/vit-gpt2-image-captioning' }],
};

export function TjsVideo() {
  const [task, setTask] = useState<FrameTask>('object-detection');
  return <TjsVideoInner key={task} task={task} setTask={setTask} />;
}

function TjsVideoInner({ task, setTask }: { task: FrameTask; setTask: (t: FrameTask) => void }) {
  const presets = FRAME_PRESETS[task];
  const { choice, setChoice, gpu } = useModelChoice(presets);
  const tjs = useTjs('Transformers.js video', task, choice);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [fps, setFps] = useState<number | null>(null);
  const runRef = useRef(tjs.run);
  runRef.current = tjs.run;

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
    <>
      <Card>
        <div className="row wrap">
          {(Object.keys(FRAME_PRESETS) as FrameTask[]).map((t) => (
            <button key={t} className={task === t ? 'chip active' : 'chip'} onClick={() => setTask(t)}>
              {t}
            </button>
          ))}
        </div>
        <ModelPicker presets={presets} choice={choice} onChange={setChoice} gpu={gpu} />
        <p className="hint">Runs any Transformers.js vision model frame-by-frame (as fast as the model allows). Frames are downscaled to 640 px.</p>
      </Card>
      <Card>
        <VideoSource videoRef={videoRef} onReady={() => setOn(true)} />
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
          {fps != null && <span>{fps.toFixed(1)} FPS</span>}
          {task === 'image-classification' && flatR.map((c: any) => <span key={c.label}>{c.label} {(c.score * 100).toFixed(0)}%</span>)}
          {task === 'image-to-text' && flatR[0]?.generated_text && <span>{flatR[0].generated_text}</span>}
        </div>
        <Progress files={tjs.files} />
        <ErrorBox error={tjs.error} />
      </Card>
    </>
  );
}
