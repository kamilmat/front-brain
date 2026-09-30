export type Device = 'webgpu' | 'wasm';

export interface RunStats {
  loadMs: number;
  inferMs: number;
  tokens: number;
  firstTokenMs?: number;
}

export interface FileProgress {
  file: string;
  loaded: number;
  total: number;
  status: string;
}

export interface RunRequest {
  task: string;
  model: string;
  device: Device;
  dtype?: string;
  args: unknown[];
  options?: Record<string, unknown>;
  stream?: boolean;
}

export interface RunHandlers {
  onProgress?: (p: any) => void;
  onToken?: (t: string) => void;
}

export interface SerializedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; h: RunHandlers }>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, type, data, stats } = e.data;
    const p = pending.get(id);
    if (!p) return;
    if (type === 'progress') p.h.onProgress?.(data);
    else if (type === 'token') p.h.onToken?.(data);
    else if (type === 'result') {
      pending.delete(id);
      p.resolve({ result: data, stats });
    } else if (type === 'error') {
      pending.delete(id);
      p.reject(new Error(data));
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Worker crashed (possibly out of memory)'));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function runTjs<T = any>(req: RunRequest, h: RunHandlers = {}): Promise<{ result: T; stats: RunStats }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, h });
    getWorker().postMessage({ type: 'run', id, ...req });
  });
}

/** Kill the worker – frees all loaded models (GPU + WASM memory). */
export function unloadAllTjs() {
  for (const p of pending.values()) p.reject(new Error('Unloaded'));
  pending.clear();
  worker?.terminate();
  worker = null;
}

export function imageToCanvas(img: SerializedImage, canvas: HTMLCanvasElement) {
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}
