/** LaMa inpainting (object removal) on raw onnxruntime-web. */
import { fetchCached, registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';

export const LAMA_MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
export const LAMA_SIZE = 512;

type Device = 'webgpu' | 'wasm';
let sessionP: Promise<{ ort: any; session: any }> | null = null;
let sessionDevice: Device | null = null;
const keyFor = (d: Device) => `onnx:Carve/LaMa-ONNX:${d}`;

export interface LamaOptions {
  modelUrl?: string;
  registry?: ModelRegistry;
  onProgress?: (fraction: number) => void;
}

export function isLamaLoaded(device: Device) {
  return !!sessionP && sessionDevice === device;
}

export function loadLama(device: Device, opts: LamaOptions = {}) {
  const reg = opts.registry ?? defaultRegistry;
  if (sessionP && sessionDevice === device) return sessionP;
  if (sessionDevice) void unloadLama(reg);
  sessionDevice = device;
  const key = keyFor(device);
  reg.upsert({ key, runtime: 'onnx', model: 'Carve/LaMa-ONNX', task: 'inpainting', device, dtype: 'fp32', status: 'loading', progress: 0 });
  const t0 = performance.now();
  const p = (async () => {
    const ort: any = device === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web');
    const buf = await fetchCached(opts.modelUrl ?? LAMA_MODEL_URL, (f) => {
      reg.patch(key, { progress: f });
      opts.onProgress?.(f);
    });
    const session = await ort.InferenceSession.create(buf, { executionProviders: [device] });
    reg.upsert(
      { key, runtime: 'onnx', model: 'Carve/LaMa-ONNX', task: 'inpainting', device, dtype: 'fp32', status: 'ready', progress: 1, bytes: buf.length, loadMs: performance.now() - t0, loadedAt: Date.now() },
      () => unloadLama(reg),
    );
    return { ort, session };
  })();
  sessionP = p;
  p.catch(() => {
    reg.remove(key);
    if (sessionP === p) sessionP = sessionDevice = null;
  });
  return p;
}

export async function unloadLama(reg: ModelRegistry = defaultRegistry) {
  const p = sessionP;
  const d = sessionDevice;
  sessionP = sessionDevice = null;
  if (d) reg.remove(keyFor(d));
  (await p?.catch(() => null))?.session.release?.();
}

/** Inpaint a 512×512 image; mask pixels with alpha > 0 are filled in. */
export async function inpaint(device: Device, image: ImageData, mask: ImageData, opts: LamaOptions = {}) {
  const t0 = performance.now();
  const { ort, session } = await loadLama(device, opts);
  const loadMs = performance.now() - t0;
  const N = LAMA_SIZE * LAMA_SIZE;
  const px = image.data;
  const mk = mask.data;
  const img = new Float32Array(3 * N);
  const m = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    img[i] = px[i * 4] / 255;
    img[N + i] = px[i * 4 + 1] / 255;
    img[2 * N + i] = px[i * 4 + 2] / 255;
    m[i] = mk[i * 4 + 3] > 0 ? 1 : 0;
  }
  const [inImg, inMask] = session.inputNames;
  const t1 = performance.now();
  const res = await session.run({
    [inImg]: new ort.Tensor('float32', img, [1, 3, LAMA_SIZE, LAMA_SIZE]),
    [inMask]: new ort.Tensor('float32', m, [1, 1, LAMA_SIZE, LAMA_SIZE]),
  });
  const inferMs = performance.now() - t1;
  const o = res[session.outputNames[0]].data as Float32Array;
  // Some exports output 0..1, others 0..255.
  let max = 0;
  for (let i = 0; i < o.length; i += 97) max = Math.max(max, o[i]);
  const scale = max <= 1.5 ? 255 : 1;
  const out = new ImageData(LAMA_SIZE, LAMA_SIZE);
  for (let i = 0; i < N; i++) {
    out.data[i * 4] = o[i] * scale;
    out.data[i * 4 + 1] = o[N + i] * scale;
    out.data[i * 4 + 2] = o[2 * N + i] * scale;
    out.data[i * 4 + 3] = 255;
  }
  return { image: out, loadMs, inferMs };
}
