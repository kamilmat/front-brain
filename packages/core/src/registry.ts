import { createStore } from './store';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** A model currently held in memory by some runtime (Transformers.js, WebLLM, MediaPipe, ONNX…). */
export interface LoadedModel {
  /** Unique key, e.g. "transformers:text-classification:Xenova/bert:wasm:q8". */
  key: string;
  runtime: string;
  model: string;
  task?: string;
  device?: string;
  dtype?: string;
  status: LoadStatus;
  /** 0..1 while loading. */
  progress?: number;
  /** Downloaded bytes of weights (≈ memory footprint). */
  bytes?: number;
  loadMs?: number;
  loadedAt?: number;
  lastUsedAt?: number;
  error?: string;
}

type Unloader = () => void | Promise<void>;

/**
 * Cross-runtime registry of loaded models. Runtimes register what they load and how to unload it,
 * so an app can show one "loaded models" list and free memory explicitly.
 */
export class ModelRegistry {
  private entries = new Map<string, { info: LoadedModel; unload?: Unloader }>();
  private store = createStore<LoadedModel[]>([]);

  readonly subscribe = this.store.subscribe;
  readonly list = () => this.store.get();

  get(key: string) {
    return this.entries.get(key)?.info;
  }

  upsert(info: LoadedModel, unload?: Unloader) {
    const prev = this.entries.get(info.key);
    this.entries.set(info.key, { info: { ...prev?.info, ...info }, unload: unload ?? prev?.unload });
    this.emit();
  }

  patch(key: string, patch: Partial<LoadedModel>) {
    const e = this.entries.get(key);
    if (!e) return;
    e.info = { ...e.info, ...patch };
    this.emit();
  }

  /** Remove without calling the unloader (runtime already freed it). */
  remove(key: string) {
    if (this.entries.delete(key)) this.emit();
  }

  async unload(key: string) {
    const e = this.entries.get(key);
    if (!e) return;
    this.entries.delete(key);
    this.emit();
    await e.unload?.();
  }

  async unloadAll(runtime?: string) {
    const keys = [...this.entries.values()].filter((e) => !runtime || e.info.runtime === runtime).map((e) => e.info.key);
    await Promise.all(keys.map((k) => this.unload(k)));
  }

  totalBytes() {
    return this.list().reduce((s, m) => s + (m.bytes ?? 0), 0);
  }

  private emit() {
    this.store.set([...this.entries.values()].map((e) => e.info));
  }
}

/** Shared default registry used by all @front-brain runtimes unless another one is passed in. */
export const registry = new ModelRegistry();
