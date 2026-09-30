import { registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';
import { specKey, type PipelineSpec, type RunStats, type WorkerRequest, type WorkerResponse } from './protocol';

export interface RuntimeOptions {
  /** Custom worker factory, e.g. `() => new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' })`
   *  where my-worker.ts contains `import '@front-brain/transformers/worker'`. */
  createWorker?: () => Worker;
  registry?: ModelRegistry;
}

export interface CallHandlers {
  /** Raw Transformers.js progress events ({ status, file, loaded, total, progress }). */
  onProgress?: (p: any) => void;
  onToken?: (text: string) => void;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; h: CallHandlers; key?: string };

/**
 * Runs Transformers.js pipelines in a dedicated Web Worker.
 * Pipelines are cached by (task, model, device, dtype) until explicitly unloaded.
 */
export class TransformersRuntime {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private registry: ModelRegistry;
  private createWorker: () => Worker;

  constructor(opts: RuntimeOptions = {}) {
    this.registry = opts.registry ?? defaultRegistry;
    this.createWorker = opts.createWorker ?? (() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  }

  /** Registry entry for a pipeline (status, bytes, loadMs…), if loaded/loading. */
  entry(spec: PipelineSpec) {
    return this.registry.get(specKey(spec));
  }

  isLoaded(spec: PipelineSpec) {
    return this.entry(spec)?.status === 'ready';
  }

  /** Download + initialise a pipeline without running it. */
  async load(spec: PipelineSpec, h: CallHandlers = {}): Promise<void> {
    await this.call({ type: 'load', id: 0, spec }, h, specKey(spec));
  }

  /** Run a pipeline (loads it first if needed). `args` are the pipeline's positional arguments. */
  run<T = any>(spec: PipelineSpec, args: unknown[], options?: Record<string, unknown>, h: CallHandlers & { stream?: boolean } = {}): Promise<{ result: T; stats: RunStats }> {
    const key = specKey(spec);
    return this.call({ type: 'run', id: 0, spec, args, options, stream: h.stream }, h, key).then((r) => {
      this.registry.patch(key, { lastUsedAt: Date.now() });
      return r;
    });
  }

  async unload(spec: PipelineSpec | string) {
    await this.registry.unload(typeof spec === 'string' ? spec : specKey(spec));
  }

  async unloadAll() {
    await this.registry.unloadAll('transformers');
  }

  /** Hard reset: kills the worker (frees everything, cancels in-flight calls). */
  terminate() {
    for (const p of this.pending.values()) p.reject(new Error('Runtime terminated'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    for (const m of this.registry.list()) if (m.runtime === 'transformers') this.registry.remove(m.key);
  }

  private ensureRegistered(spec: PipelineSpec, key: string) {
    if (this.registry.get(key)) return;
    this.registry.upsert(
      { key, runtime: 'transformers', model: spec.model, task: spec.task, device: spec.device, dtype: spec.dtype, status: 'loading', progress: 0 },
      () => this.post({ type: 'unload', id: 0, key }),
    );
  }

  private call(req: WorkerRequest, h: CallHandlers, key?: string): Promise<any> {
    if (key && 'spec' in req) this.ensureRegistered(req.spec, key);
    return this.post(req, h, key);
  }

  private post(req: WorkerRequest, h: CallHandlers = {}, key?: string): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, h, key });
      this.getWorker().postMessage({ ...req, id });
    });
  }

  private getWorker() {
    if (this.worker) return this.worker;
    const w = this.createWorker();
    const files: Record<string, { loaded: number; total: number }> = {};
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      switch (msg.type) {
        case 'progress': {
          const d = msg.data;
          if (p.key && d.file && d.total) {
            files[`${p.key}|${d.file}`] = { loaded: d.loaded ?? 0, total: d.total };
            const mine = Object.entries(files).filter(([k]) => k.startsWith(p.key + '|')).map(([, v]) => v);
            const total = mine.reduce((s, f) => s + f.total, 0);
            this.registry.patch(p.key, { progress: total ? mine.reduce((s, f) => s + f.loaded, 0) / total : 0 });
          }
          p.h.onProgress?.(d);
          break;
        }
        case 'token':
          p.h.onToken?.(msg.data);
          break;
        case 'loaded':
          if (p.key) this.registry.patch(p.key, { status: 'ready', progress: 1, bytes: msg.data.bytes, loadMs: msg.data.loadMs, loadedAt: Date.now(), error: undefined });
          break;
        case 'result':
          this.pending.delete(msg.id);
          if (p.key) this.registry.patch(p.key, { status: 'ready' });
          p.resolve({ result: msg.data, stats: msg.stats });
          break;
        case 'done':
          this.pending.delete(msg.id);
          if (p.key) this.registry.patch(p.key, { status: 'ready' });
          p.resolve(undefined);
          break;
        case 'error':
          this.pending.delete(msg.id);
          // A failed load leaves nothing in memory; a failed run keeps the loaded pipeline.
          if (p.key && this.registry.get(p.key)?.status === 'loading') this.registry.remove(p.key);
          p.reject(new Error(msg.data));
          break;
      }
    };
    w.onerror = (e) => {
      const err = new Error(e.message || 'Worker crashed (possibly out of memory)');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.worker = null;
      for (const m of this.registry.list()) if (m.runtime === 'transformers') this.registry.remove(m.key);
    };
    this.worker = w;
    return w;
  }
}

let shared: TransformersRuntime | null = null;
/** Lazily-created shared runtime (one worker for the whole app). */
export const getTransformersRuntime = (opts?: RuntimeOptions) => (shared ??= new TransformersRuntime(opts));
