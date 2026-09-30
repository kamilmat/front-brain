/** LaMa inpainting (object removal) via raw onnxruntime-web. */
export const LAMA_MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
export const LAMA_SIZE = 512;

let sessionP: Promise<{ ort: any; session: any }> | null = null;
let sessionDevice = '';

/** Fetch with byte progress, cached in Cache Storage. */
export async function fetchCached(url: string, onProgress?: (p: number) => void, cacheName = 'fb-onnx'): Promise<Uint8Array> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(url);
  if (hit) {
    onProgress?.(1);
    return new Uint8Array(await hit.arrayBuffer());
  }
  const net = await fetch(url);
  if (!net.ok) throw new Error(`Download failed: ${net.status}`);
  const total = +(net.headers.get('content-length') ?? 0);
  const reader = net.body!.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (total) onProgress?.(loaded / total);
  }
  const blob = new Blob(parts as BlobPart[]);
  await cache.put(url, new Response(blob)).catch(() => {});
  return new Uint8Array(await blob.arrayBuffer());
}

export function loadLama(device: 'webgpu' | 'wasm', onProgress?: (p: number) => void) {
  if (sessionP && sessionDevice === device) return sessionP;
  sessionDevice = device;
  sessionP = (async () => {
    const ort: any = device === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web');
    const buf = await fetchCached(LAMA_MODEL_URL, onProgress);
    const session = await ort.InferenceSession.create(buf, { executionProviders: [device] });
    return { ort, session };
  })();
  sessionP.catch(() => (sessionP = null));
  return sessionP;
}

/**
 * Inpaint a 512×512 image. `mask` pixels with alpha > 0 are filled in.
 * Returns the result and timings.
 */
export async function inpaint(device: 'webgpu' | 'wasm', image: ImageData, mask: ImageData, onProgress?: (p: number) => void) {
  const t0 = performance.now();
  const { ort, session } = await loadLama(device, onProgress);
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
