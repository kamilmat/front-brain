import { getTransformersRuntime, type PipelineSpec, type TransformersRuntime } from '@front-brain/transformers';
import { startMic, type MicStream } from './mic.js';
import { EnergyVad, type VadOptions } from './vad.js';
import type { Recognizer, RecognizerCallbacks } from './types.js';

export interface WhisperLiveOptions extends RecognizerCallbacks {
  /** ASR pipeline, e.g. { task: 'automatic-speech-recognition', model: 'onnx-community/whisper-base', device: 'webgpu' }. */
  spec: PipelineSpec;
  /** Whisper language name, e.g. 'polish', 'english'; omit for auto-detect / non-Whisper models. */
  language?: string;
  /** Transcribe the unfinished utterance every N ms for live (interim) text. 0 disables. Default 1500. */
  interimMs?: number;
  vad?: VadOptions;
  runtime?: TransformersRuntime;
}

/** Whisper (or other ASR) hallucinations on silence/noise that should be dropped. */
const HALLUCINATIONS = [
  /^\s*(dziękuję( bardzo)?( za (uwagę|obejrzenie))?|thank you( for watching)?|thanks for watching)[.!\s]*$/i,
  /napisy (stworzone|wykonane)/i,
  /subtitles by/i,
  /^\s*[.…\-–\s]*$/,
  /^\s*\[.*\]\s*$/,
  /^\s*\(.*\)\s*$/,
];
export const isHallucination = (t: string) => HALLUCINATIONS.some((r) => r.test(t));

/**
 * On-device live transcription: microphone → energy VAD → Whisper (Transformers.js worker).
 * Emits interim text while speaking and a final transcript ~when each phrase ends.
 */
export function createWhisperRecognizer(opts: WhisperLiveOptions): Recognizer {
  const rt = opts.runtime ?? getTransformersRuntime();
  let mic: MicStream | null = null;
  let listening = false;
  let seq = 0;
  let utt = `wh-${++seq}`;
  let interimBusy = false;
  let finals: Promise<unknown> = Promise.resolve();
  const asrOptions = () => ({ ...(opts.language ? { language: opts.language, task: 'transcribe' } : {}) });

  const transcribe = async (audio: Float32Array) => {
    const { result } = await rt.run<{ text: string }>(opts.spec, [audio], asrOptions());
    return (result?.text ?? '').trim();
  };

  const vad = new EnergyVad(
    {
      onSpeechStart: () => opts.onSpeech?.(true),
      onSpeechProgress: (audio) => {
        if (!opts.interimMs || interimBusy) return;
        interimBusy = true;
        const id = utt;
        transcribe(audio)
          .then((text) => {
            if (text && !isHallucination(text) && id === utt) opts.onTranscript({ utteranceId: id, text, final: false });
          })
          .catch(() => {})
          .finally(() => (interimBusy = false));
      },
      onSpeechEnd: (segment) => {
        opts.onSpeech?.(false);
        const id = utt;
        utt = `wh-${++seq}`;
        const endedAt = performance.now();
        // Finals are serialised so they arrive in order.
        finals = finals.then(async () => {
          opts.onState?.('processing');
          try {
            const text = await transcribe(segment);
            if (text && !isHallucination(text)) opts.onTranscript({ utteranceId: id, text, final: true, latencyMs: performance.now() - endedAt });
          } catch (e) {
            opts.onError?.((e as Error).message);
          } finally {
            if (listening) opts.onState?.('listening');
          }
        });
      },
    },
    opts.vad,
    opts.interimMs || 1500,
  );

  return {
    engine: 'whisper',
    get listening() {
      return listening;
    },
    level: () => mic?.level() ?? 0,
    async start() {
      if (listening) return;
      opts.onState?.('loading');
      try {
        await rt.load(opts.spec); // download + init before opening the mic
        mic = await startMic((chunk) => vad.push(chunk), { sampleRate: 16000 });
      } catch (e) {
        opts.onState?.('idle');
        throw e;
      }
      listening = true;
      opts.onState?.('listening');
    },
    async stop() {
      listening = false;
      vad.flush();
      mic?.stop();
      mic = null;
      await finals;
      opts.onState?.('idle');
    },
  };
}
