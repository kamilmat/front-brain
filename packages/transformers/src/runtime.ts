import { activity, registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';
import { specKey, type PipelineSpec, type RunStats, type WorkerRequest, type WorkerResponse } from './protocol.js';

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

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; h: CallHandlers; key?: string; /** This call created the registry entry (i.e. it is the load). */ owner?: boolean; /** Ends the activity span of a running inference. */ endActivity?: () => void };

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

  /** Returns true when this call created the entry. */
  private ensureRegistered(spec: PipelineSpec, key: string) {
    if (this.registry.get(key)) return false;
    this.registry.upsert(
      { key, runtime: 'transformers', model: spec.model, task: spec.task, device: spec.device, dtype: spec.dtype, status: 'loading', progress: 0 },
      () => this.post({ type: 'unload', id: 0, key }),
    );
    return true;
  }

  private call(req: WorkerRequest, h: CallHandlers, key?: string): Promise<any> {
    const owner = !!key && 'spec' in req && this.ensureRegistered(req.spec, key);
    return this.post(req, h, key, owner);
  }

  private post(req: WorkerRequest, h: CallHandlers = {}, key?: string, owner = false): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, h, key, owner });
      try {
        this.getWorker().postMessage({ ...req, id });
      } catch (e) {
        // e.g. DataCloneError for non-cloneable args/options
        this.pending.delete(id);
        if (owner && key && this.registry.get(key)?.status === 'loading') this.registry.remove(key);
        reject(e);
      }
    });
  }

  private clearFiles(files: Record<string, unknown>, key: string) {
    for (const k of Object.keys(files)) if (k.startsWith(key + '|')) delete files[k];
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
        case 'infer-start':
          if (p.key) p.endActivity = activity.begin(p.key);
          break;
        case 'loaded':
          if (p.key) this.clearFiles(files, p.key);
          if (p.key) this.registry.patch(p.key, { status: 'ready', progress: 1, bytes: msg.data.bytes, loadMs: msg.data.loadMs, loadedAt: Date.now(), error: undefined });
          break;
        case 'result':
          p.endActivity?.();
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
          p.endActivity?.();
          this.pending.delete(msg.id);
          // A failed load leaves nothing in memory; a failed run keeps the loaded pipeline.
          // Only the call that created the entry may remove it (a newer load may own it now).
          if (p.key) this.clearFiles(files, p.key);
          if (p.key && p.owner && this.registry.get(p.key)?.status === 'loading') this.registry.remove(p.key);
          p.reject(new Error(msg.data));
          break;
      }
    };
    w.onerror = (e) => {
      e.preventDefault();
      const err = new Error(e.message || 'Worker crashed (possibly out of memory)');
      for (const p of this.pending.values()) {
        p.endActivity?.();
        p.reject(err);
      }
      this.pending.clear();
      // An uncaught worker error doesn't stop the worker – kill it so its models free their memory.
      w.terminate();
      if (this.worker === w) this.worker = null;
      for (const m of this.registry.list()) if (m.runtime === 'transformers') this.registry.remove(m.key);
    };
    this.worker = w;
    return w;
  }
}

let shared: TransformersRuntime | null = null;
/** Lazily-created shared runtime (one worker for the whole app). */
export const getTransformersRuntime = (opts?: RuntimeOptions) => (shared ??= new TransformersRuntime(opts));
