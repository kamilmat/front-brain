/** LaMa inpainting (object removal) on raw onnxruntime-web. */
import { fetchCached, registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';

export const LAMA_MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
export const LAMA_SIZE = 512;

type Device = 'webgpu' | 'wasm';
interface Loaded {
  ort: any;
  session: any;
}

/** Current load (one model at a time). */
let current: { device: Device; key: string; promise: Promise<Loaded> } | null = null;
/** Runs in progress per session – release waits for them. */
const running = new Map<any, Set<Promise<unknown>>>();
let seq = 0;

export interface LamaOptions {
  modelUrl?: string;
  registry?: ModelRegistry;
  onProgress?: (fraction: number) => void;
}

export function isLamaLoaded(device: Device) {
  return current?.device === device;
}

async function release(promise: Promise<Loaded>) {
  const loaded = await promise.catch(() => null);
  if (!loaded) return;
  await Promise.allSettled([...(running.get(loaded.session) ?? [])]);
  running.delete(loaded.session);
  await loaded.session.release?.();
}

export function loadLama(device: Device, opts: LamaOptions = {}): Promise<Loaded> {
  const reg = opts.registry ?? defaultRegistry;
  if (current?.device === device) return current.promise;
  if (current) void unloadLama(reg);
  // Unique key per load so a stale load can never touch a newer entry.
  const key = `onnx:Carve/LaMa-ONNX:${device}#${++seq}`;
  reg.upsert({ key, runtime: 'onnx', model: 'Carve/LaMa-ONNX', task: 'inpainting', device, dtype: 'fp32', status: 'loading', progress: 0 });
  const t0 = performance.now();
  // eslint-disable-next-line prefer-const -- referenced inside its own initializer (cancellation check)
  let promise!: Promise<Loaded>;
  promise = (async () => {
    const ort: any = device === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web');
    const buf = await fetchCached(opts.modelUrl ?? LAMA_MODEL_URL, (f) => {
      reg.patch(key, { progress: f });
      opts.onProgress?.(f);
    });
    const session = await ort.InferenceSession.create(buf, { executionProviders: [device] });
    if (current?.promise !== promise) {
      // Superseded or unloaded while loading.
      await session.release?.();
      throw new Error('LaMa load was cancelled');
    }
    reg.patch(key, { status: 'ready', progress: 1, bytes: buf.length, loadMs: performance.now() - t0, loadedAt: Date.now() });
    return { ort, session };
  })();
  current = { device, key, promise };
  reg.upsert(reg.get(key)!, () => {
    if (current?.promise === promise) current = null;
    return release(promise);
  });
  promise.catch(() => {
    reg.remove(key);
    if (current?.promise === promise) current = null;
  });
  return promise;
}

export async function unloadLama(reg: ModelRegistry = defaultRegistry) {
  const c = current;
  current = null;
  if (!c) return;
  reg.remove(c.key);
  await release(c.promise);
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
  const run: Promise<any> = session.run({
    [inImg]: new ort.Tensor('float32', img, [1, 3, LAMA_SIZE, LAMA_SIZE]),
    [inMask]: new ort.Tensor('float32', m, [1, 1, LAMA_SIZE, LAMA_SIZE]),
  });
  const set = running.get(session) ?? new Set();
  running.set(session, set.add(run));
  let res: any;
  try {
    res = await run;
  } finally {
    set.delete(run);
  }
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
