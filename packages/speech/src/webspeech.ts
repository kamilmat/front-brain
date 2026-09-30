import type { Recognizer, RecognizerCallbacks } from './types.js';

const SR = (): any => (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const isWebSpeechSupported = () => !!SR();

export interface WebSpeechOptions extends RecognizerCallbacks {
  /** BCP-47 language, e.g. 'pl-PL', 'en-US'. */
  lang?: string;
  /** Ask for on-device recognition where supported (Chrome 139+ `processLocally`). */
  preferOnDevice?: boolean;
}

/**
 * Browser speech recognition (continuous, interim results, auto-restart).
 * Note: in Chrome the audio is typically processed by Google's servers unless on-device mode is available.
 */
export function createWebSpeechRecognizer(opts: WebSpeechOptions): Recognizer {
  const Ctor = SR();
  if (!Ctor) throw new Error('Web Speech API is not supported in this browser (try Chrome, Edge or Safari).');
  let rec: any = null;
  let listening = false;
  let seq = 0;
  let utt = `ws-${++seq}`;
  let speechEndAt = 0;

  const make = () => {
    const r = new Ctor();
    r.lang = opts.lang ?? 'pl-PL';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (opts.preferOnDevice && 'processLocally' in r) r.processLocally = true;
    r.onstart = () => opts.onState?.('listening');
    r.onspeechstart = () => opts.onSpeech?.(true);
    r.onspeechend = () => {
      speechEndAt = performance.now();
      opts.onSpeech?.(false);
    };
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        opts.onTranscript({ utteranceId: utt, text, final: res.isFinal, latencyMs: res.isFinal && speechEndAt ? performance.now() - speechEndAt : undefined });
        if (res.isFinal) utt = `ws-${++seq}`;
      }
    };
    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const msg =
        e.error === 'not-allowed'
          ? 'Microphone permission denied.'
          : e.error === 'network'
            ? 'Network error – Web Speech in this browser needs an internet connection (cloud recognition).'
            : e.error === 'language-not-supported'
              ? `Language ${r.lang} is not supported here.`
              : `Speech recognition error: ${e.error}`;
      opts.onError?.(msg);
      if (e.error === 'not-allowed' || e.error === 'language-not-supported') listening = false;
    };
    // Chrome ends sessions after silence/timeouts – restart while we still want to listen.
    r.onend = () => {
      if (listening) {
        try {
          r.start();
        } catch {
          setTimeout(() => listening && r.start(), 250);
        }
      } else opts.onState?.('idle');
    };
    return r;
  };

  return {
    engine: 'webspeech',
    get listening() {
      return listening;
    },
    level: () => 0,
    async start() {
      if (listening) return;
      listening = true;
      rec = make();
      rec.start();
    },
    async stop() {
      listening = false;
      rec?.stop();
      rec = null;
    },
  };
}
