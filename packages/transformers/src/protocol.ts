export type Device = 'webgpu' | 'wasm';

/** Identifies one loaded pipeline. */
export interface PipelineSpec {
  task: string;
  model: string;
  device?: Device;
  /** 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' | … ; undefined = library default. */
  dtype?: string;
}

export const specKey = (s: PipelineSpec) => `transformers:${s.task}:${s.model}:${s.device ?? 'auto'}:${s.dtype ?? 'auto'}`;

export type WorkerRequest =
  | { type: 'load'; id: number; spec: PipelineSpec }
  | { type: 'run'; id: number; spec: PipelineSpec; args: unknown[]; options?: Record<string, unknown>; stream?: boolean }
  | { type: 'unload'; id: number; key: string }
  | { type: 'unloadAll'; id: number };

export interface RunStats {
  /** 0 when the pipeline was already loaded. */
  loadMs: number;
  inferMs: number;
  tokens: number;
  firstTokenMs?: number;
}

export type WorkerResponse =
  | { id: number; type: 'progress'; data: any }
  | { id: number; type: 'token'; data: string }
  /** Inference (not loading) started – used for live activity tracking. */
  | { id: number; type: 'infer-start' }
  | { id: number; type: 'loaded'; data: { loadMs: number; bytes: number; cached: boolean } }
  | { id: number; type: 'result'; data: any; stats: RunStats }
  | { id: number; type: 'done' }
  | { id: number; type: 'error'; data: string };

/** Serialized RawImage (RGBA) as returned from the worker. */
export interface SerializedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
