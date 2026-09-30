/// <reference lib="webworker" />
import { pipeline, env, TextStreamer, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;

type Msg =
  | { type: 'run'; id: number; task: string; model: string; device: string; dtype?: string; args: unknown[]; options?: Record<string, unknown>; stream?: boolean }
  | { type: 'dispose' };

const pipes = new Map<string, Promise<any>>();
const post = (m: unknown, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

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

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === 'dispose') {
    for (const p of pipes.values()) (await p.catch(() => null))?.dispose?.();
    pipes.clear();
    post({ type: 'disposed' });
    return;
  }

  const { id, task, model, device, dtype, stream } = msg;
  const key = JSON.stringify([task, model, device, dtype]);
  try {
    const t0 = performance.now();
    const cached = pipes.has(key);
    if (!cached) {
      pipes.set(
        key,
        pipeline(task as any, model, {
          device: device as any,
          dtype: (dtype || undefined) as any,
          progress_callback: (p: any) => post({ id, type: 'progress', data: p }),
        }),
      );
    }
    let pipe: any;
    try {
      pipe = await pipes.get(key);
    } catch (err) {
      pipes.delete(key);
      throw err;
    }
    const loadMs = cached ? 0 : performance.now() - t0;

    let args = msg.args;
    // Different fill-mask models use different mask tokens ([MASK] vs <mask>).
    if (task === 'fill-mask' && pipe.tokenizer?.mask_token && typeof args[0] === 'string') {
      args = [args[0].replace(/\[MASK\]|<mask>/g, pipe.tokenizer.mask_token), ...args.slice(1)];
    }

    const options: Record<string, unknown> = { ...msg.options };
    let tokens = 0;
    let firstTokenMs: number | undefined;
    const t1 = performance.now();
    if (stream && pipe.tokenizer) {
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
