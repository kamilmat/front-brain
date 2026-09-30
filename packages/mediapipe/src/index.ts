import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  HandLandmarker,
  ImageSegmenter,
  ObjectDetector,
  PoseLandmarker,
} from '@mediapipe/tasks-vision';
import { activity, registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';

export type VisionKind = 'face' | 'hand' | 'pose' | 'gesture' | 'object' | 'selfie';

const GCS = 'https://storage.googleapis.com/mediapipe-models/';
export const VISION_TASKS: Record<VisionKind, { label: string; model: string; sizeMB: number }> = {
  face: { label: 'Face landmarks (478 pts + blendshapes)', model: GCS + 'face_landmarker/face_landmarker/float16/1/face_landmarker.task', sizeMB: 4 },
  hand: { label: 'Hand landmarks', model: GCS + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', sizeMB: 8 },
  pose: { label: 'Body pose', model: GCS + 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', sizeMB: 6 },
  gesture: { label: 'Gesture recognition', model: GCS + 'gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task', sizeMB: 8 },
  object: { label: 'Object detection (EfficientDet-Lite0)', model: GCS + 'object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite', sizeMB: 7 },
  selfie: { label: 'Selfie / background segmentation', model: GCS + 'image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', sizeMB: 0.3 },
};

export const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

export interface VisionTaskOptions {
  delegate?: 'GPU' | 'CPU';
  /** Override the model file URL. */
  modelAssetPath?: string;
  /** Override the WASM fileset base URL. */
  wasmBase?: string;
  registry?: ModelRegistry;
}

export interface VisionTask {
  kind: VisionKind;
  delegate: 'GPU' | 'CPU';
  /** Registry key (unique per task instance). */
  key: string;
  /** Process one video frame (timestamp in ms, monotonically increasing). */
  detect(frame: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, timestampMs: number): any;
  /** Draw a result onto a canvas sized like the frame. Returns a short text summary (gestures, blendshapes…). */
  draw(ctx: CanvasRenderingContext2D, result: any): string;
  close(): void;
}

let seq = 0;

export async function createVisionTask(kind: VisionKind, opts: VisionTaskOptions = {}): Promise<VisionTask> {
  const reg = opts.registry ?? defaultRegistry;
  const delegate = opts.delegate ?? 'GPU';
  // Unique per task instance, so closing an older task never removes a newer task's entry.
  const key = `mediapipe:${kind}:${delegate}#${++seq}`;
  reg.upsert({ key, runtime: 'mediapipe', model: kind, task: kind, device: delegate, status: 'loading' });
  const t0 = performance.now();
  let runner: any;
  try {
    const fileset = await FilesetResolver.forVisionTasks(opts.wasmBase ?? MEDIAPIPE_WASM);
    const base = { baseOptions: { modelAssetPath: opts.modelAssetPath ?? VISION_TASKS[kind].model, delegate }, runningMode: 'VIDEO' as const };
    runner =
      kind === 'face' ? await FaceLandmarker.createFromOptions(fileset, { ...base, numFaces: 2, outputFaceBlendshapes: true })
      : kind === 'hand' ? await HandLandmarker.createFromOptions(fileset, { ...base, numHands: 2 })
      : kind === 'pose' ? await PoseLandmarker.createFromOptions(fileset, { ...base, numPoses: 2 })
      : kind === 'gesture' ? await GestureRecognizer.createFromOptions(fileset, { ...base, numHands: 2 })
      : kind === 'object' ? await ObjectDetector.createFromOptions(fileset, { ...base, scoreThreshold: 0.4, maxResults: 10 })
      : await ImageSegmenter.createFromOptions(fileset, { ...base, outputCategoryMask: true, outputConfidenceMasks: false });
  } catch (e) {
    reg.remove(key);
    throw e;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    reg.remove(key);
    runner.close();
  };
  reg.upsert(
    { key, runtime: 'mediapipe', model: kind, task: kind, device: delegate, status: 'ready', loadMs: performance.now() - t0, loadedAt: Date.now(), bytes: VISION_TASKS[kind].sizeMB * 2 ** 20 },
    close,
  );
  return {
    kind,
    delegate,
    key,
    detect: (frame, ts) => (kind === 'gesture' ? runner.recognizeForVideo(frame, ts) : kind === 'selfie' ? runner.segmentForVideo(frame, ts) : runner.detectForVideo(frame, ts)),
    draw: (ctx, r) => drawResult(kind, ctx, r),
    close,
  };
}

function drawResult(kind: VisionKind, ctx: CanvasRenderingContext2D, r: any): string {
  const draw = new DrawingUtils(ctx);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (kind === 'face') {
    for (const lm of r.faceLandmarks) {
      draw.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#C0C0C070', lineWidth: 1 });
      draw.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF3030' });
      draw.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#30FF30' });
      draw.drawConnectors(lm, FaceLandmarker.FACE_LANDMARKS_LIPS, { color: '#E0E0E0' });
    }
    const bs = r.faceBlendshapes?.[0]?.categories ?? [];
    return bs.filter((c: any) => c.score > 0.4).sort((a: any, b: any) => b.score - a.score).slice(0, 5).map((c: any) => `${c.categoryName} ${(c.score * 100).toFixed(0)}%`).join(' · ');
  }
  if (kind === 'hand' || kind === 'gesture') {
    for (const lm of r.landmarks) {
      draw.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
      draw.drawLandmarks(lm, { color: '#FF0000', lineWidth: 1 });
    }
    return kind === 'gesture' ? r.gestures.map((g: any) => `${g[0].categoryName} ${(g[0].score * 100).toFixed(0)}%`).join(' · ') : `${r.landmarks.length} hand(s)`;
  }
  if (kind === 'pose') {
    for (const lm of r.landmarks) {
      draw.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#00E0FF', lineWidth: 3 });
      draw.drawLandmarks(lm, { color: '#FF00AA', radius: 3 });
    }
    return `${r.landmarks.length} person(s)`;
  }
  if (kind === 'object') {
    ctx.lineWidth = 3;
    ctx.font = '18px sans-serif';
    for (const det of r.detections) {
      const b = det.boundingBox;
      ctx.strokeStyle = ctx.fillStyle = '#00FF88';
      ctx.strokeRect(b.originX, b.originY, b.width, b.height);
      const c = det.categories[0];
      ctx.fillText(`${c.categoryName} ${(c.score * 100).toFixed(0)}%`, b.originX + 4, b.originY + 20);
    }
    return `${r.detections.length} object(s)`;
  }
  if (r.categoryMask) {
    const mask = r.categoryMask.getAsUint8Array();
    const img = ctx.createImageData(ctx.canvas.width, ctx.canvas.height);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) {
        img.data[i * 4 + 1] = 120;
        img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = 140;
      }
    }
    ctx.putImageData(img, 0, 0);
    r.close?.();
  }
  return '';
}

/**
 * Run a task on every new video frame and draw on `canvas`. Returns a stop function.
 * `onStats` receives FPS once per second plus the task's text summary.
 */
export function runVideoLoop(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  task: VisionTask,
  onStats?: (s: { fps: number; summary: string }) => void,
  /** Raw task result for every processed frame (before drawing). */
  onResult?: (result: any, timestampMs: number) => void,
) {
  const ctx = canvas.getContext('2d')!;
  let raf = 0;
  let stopped = false;
  let lastT = -1;
  let frames = 0;
  let lastFps = performance.now();
  let summary = '';
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastT) return;
    lastT = video.currentTime;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const now = performance.now();
    const result = task.detect(video, now);
    activity.record(task.key, now, performance.now());
    onResult?.(result, now);
    summary = task.draw(ctx, result);
    frames++;
    if (now - lastFps > 1000) {
      onStats?.({ fps: Math.round((frames * 1000) / (now - lastFps)), summary });
      frames = 0;
      lastFps = now;
    }
  };
  loop();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

export * from './gestures.js';
export * from './face.js';
