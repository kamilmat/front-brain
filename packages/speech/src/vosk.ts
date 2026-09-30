import { registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';
import { startMic, type MicStream } from './mic.js';
import type { Recognizer, RecognizerCallbacks } from './types.js';

export interface VoskOptions extends RecognizerCallbacks {
  /** URL of a gzipped tar of a Vosk model folder (must be same-origin or CORS-enabled). */
  modelUrl: string;
  /**
   * Optional grammar: restrict recognition to these words/phrases (plus "[unk]").
   * Dramatically improves accuracy for command-style use.
   */
  grammar?: string[];
  registry?: ModelRegistry;
}

const models = new Map<string, Promise<any>>();

/** Load (once) a Vosk model; tracked in the registry. Needs the optional `vosk-browser` package. */
async function loadModel(url: string, reg: ModelRegistry) {
  if (!models.has(url)) {
    const key = `vosk:${url}`;
    reg.upsert({ key, runtime: 'vosk', model: url.split('/').pop()!.replace(/\.tar\.gz$/, ''), task: 'speech-recognition', device: 'wasm', status: 'loading' });
    const t0 = performance.now();
    const p = (async () => {
      const mod: any = await import('vosk-browser');
      const Vosk = mod.createModel ? mod : mod.default;
      const model = await Vosk.createModel(url);
      reg.upsert(
        { key, runtime: 'vosk', model: url.split('/').pop()!.replace(/\.tar\.gz$/, ''), task: 'speech-recognition', device: 'wasm', status: 'ready', loadMs: performance.now() - t0, loadedAt: Date.now() },
        () => {
          models.delete(url);
          model.terminate();
        },
      );
      return model;
    })();
    models.set(url, p);
    p.catch(() => {
      models.delete(url);
      reg.remove(key);
    });
  }
  return models.get(url)!;
}

/** Streaming on-device recognition with Vosk (Kaldi compiled to WebAssembly). */
export function createVoskRecognizer(opts: VoskOptions): Recognizer {
  const reg = opts.registry ?? defaultRegistry;
  let mic: MicStream | null = null;
  let rec: any = null;
  let listening = false;
  let seq = 0;
  let utt = `vk-${++seq}`;
  let lastPartial = '';

  return {
    engine: 'vosk',
    get listening() {
      return listening;
    },
    level: () => mic?.level() ?? 0,
    async start() {
      if (listening) return;
      opts.onState?.('loading');
      try {
        const model = await loadModel(opts.modelUrl, reg);
        rec = new model.KaldiRecognizer(16000, opts.grammar?.length ? JSON.stringify([...opts.grammar.map((g) => g.toLowerCase()), '[unk]']) : undefined);
        rec.on('partialresult', (m: any) => {
          const text = m.result?.partial ?? '';
          if (text && text !== lastPartial) {
            if (!lastPartial) opts.onSpeech?.(true);
            lastPartial = text;
            opts.onTranscript({ utteranceId: utt, text, final: false });
          }
        });
        rec.on('result', (m: any) => {
          const text = (m.result?.text ?? '').trim();
          if (text && text !== '[unk]') opts.onTranscript({ utteranceId: utt, text: text.replace(/\[unk\]/g, '').trim(), final: true });
          if (lastPartial) opts.onSpeech?.(false);
          lastPartial = '';
          utt = `vk-${++seq}`;
        });
        rec.on('error', (m: any) => opts.onError?.(String(m.error)));
        mic = await startMic((chunk) => rec?.acceptWaveformFloat(chunk, 16000), { sampleRate: 16000 });
      } catch (e) {
        opts.onState?.('idle');
        throw e;
      }
      listening = true;
      opts.onState?.('listening');
    },
    async stop() {
      listening = false;
      mic?.stop();
      mic = null;
      rec?.retrieveFinalResult();
      const r = rec;
      rec = null;
      setTimeout(() => r?.remove(), 500);
      opts.onState?.('idle');
    },
  };
}
