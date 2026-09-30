/// <reference lib="webworker" />
/**
 * Transformers.js worker. Import this module from your own worker file, or let
 * TransformersRuntime spawn it automatically.
 */
import { pipeline, env, TextStreamer, RawImage } from '@huggingface/transformers';
import { specKey, type WorkerRequest, type WorkerResponse } from './protocol';

env.allowLocalModels = false;

const pipes = new Map<string, Promise<any>>();
const post = (m: WorkerResponse, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

/** Convert library objects into structured-clone friendly shapes. */
function serialize(v: any, transfer: Transferable[]): any {
  if (v instanceof RawImage) {
    const img = v.rgba();
    const data = new Uint8ClampedArray(img.data);
    transfer.push(data.buffer);
    return { __image: { width: img.width, height: img.height, data } };
  }
  if (v && typeof v === 'object' && v.audio instanceof Float32Array && typeof v.sampling_rate === 'number') {
    return { __audio: { audio: v.audio, sampling_rate: v.sampling_rate } };
  }
  if (v && typeof v === 'object' && Array.isArray(v.dims) && v.data && typeof v.type === 'string') {
    return { __tensor: { dims: v.dims, type: v.type, data: Array.from(v.data as ArrayLike<number>, Number) } };
  }
  if (Array.isArray(v)) return v.map((x) => serialize(x, transfer));
  if (v && typeof v === 'object' && v.constructor === Object) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serialize(x, transfer)]));
  }
  return v;
}

async function ensure(id: number, spec: WorkerRequest & { type: 'load' | 'run' }) {
  const s = spec.spec;
  const key = specKey(s);
  const cached = pipes.has(key);
  const t0 = performance.now();
  const bytes: Record<string, number> = {};
  if (!cached) {
    pipes.set(
      key,
      pipeline(s.task as any, s.model, {
        device: s.device as any,
        dtype: s.dtype as any,
        progress_callback: (p: any) => {
          if (p.file && p.total) bytes[p.file] = p.total;
          post({ id, type: 'progress', data: p });
        },
      }),
    );
  }
  try {
    const pipe = await pipes.get(key)!;
    const loadMs = cached ? 0 : performance.now() - t0;
    if (!cached) post({ id, type: 'loaded', data: { loadMs, bytes: Object.values(bytes).reduce((a, b) => a + b, 0), cached } });
    return { pipe, loadMs };
  } catch (err) {
    pipes.delete(key);
    throw err;
  }
}

async function dispose(key: string) {
  const p = pipes.get(key);
  pipes.delete(key);
  (await p?.catch(() => null))?.dispose?.();
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const { id } = msg;
  try {
    if (msg.type === 'unload') {
      await dispose(msg.key);
      return post({ id, type: 'done' });
    }
    if (msg.type === 'unloadAll') {
      await Promise.all([...pipes.keys()].map(dispose));
      return post({ id, type: 'done' });
    }
    const { pipe, loadMs } = await ensure(id, msg);
    if (msg.type === 'load') return post({ id, type: 'done' });

    let args = msg.args;
    // Fill-mask models use different mask tokens ([MASK] vs <mask>).
    if (msg.spec.task === 'fill-mask' && pipe.tokenizer?.mask_token && typeof args[0] === 'string') {
      args = [args[0].replace(/\[MASK\]|<mask>/g, pipe.tokenizer.mask_token), ...args.slice(1)];
    }
    const options: Record<string, unknown> = { ...msg.options };
    let tokens = 0;
    let firstTokenMs: number | undefined;
    const t1 = performance.now();
    if (msg.stream && pipe.tokenizer) {
      options.streamer = new TextStreamer(pipe.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => post({ id, type: 'token', data: text }),
        token_callback_function: () => {
          tokens++;
          firstTokenMs ??= performance.now() - t1;
        },
      });
    }
    const out = await pipe(...args, options);
    const inferMs = performance.now() - t1;
    const transfer: Transferable[] = [];
    post({ id, type: 'result', data: serialize(out, transfer), stats: { loadMs, inferMs, tokens, firstTokenMs } }, transfer);
  } catch (err) {
    post({ id, type: 'error', data: String((err as Error)?.message ?? err) });
  }
};
