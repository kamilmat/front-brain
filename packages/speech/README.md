# @front-brain/speech

Live speech recognition in the browser with three interchangeable engines, plus keyword/command spotting.

| Engine | Where it runs | Latency | Notes |
|---|---|---|---|
| `createWebSpeechRecognizer` | Browser's speech service (Chrome/Edge: usually cloud) | instant, streaming | no download; not in Firefox |
| `createWhisperRecognizer` | on-device (Transformers.js worker) | ~phrase end + inference | mic → energy VAD → Whisper; interim text while speaking |
| `createVoskRecognizer` | on-device (Kaldi WASM) | streaming | needs `vosk-browser` and a same-origin/CORS model `.tar.gz`; optional command grammar |

```ts
import { createWhisperRecognizer, KeywordSpotter } from '@front-brain/speech';

const spotter = new KeywordSpotter([
  { id: 'next', phrases: ['next', 'następny', 'dalej'] },
  { id: 'lights-off', phrases: ['lights off', 'zgaś światło'] },
]);

const rec = createWhisperRecognizer({
  spec: { task: 'automatic-speech-recognition', model: 'onnx-community/whisper-base', device: 'webgpu' },
  language: 'polish',
  onTranscript: ({ utteranceId, text, final }) => {
    for (const m of spotter.feed(text, utteranceId, final)) console.log('command', m.id);
  },
});
await rec.start();
```

Also exported: `startMic()` (16 kHz AudioWorklet capture), `EnergyVad`, `findCommands()`, `normalizeWords()` (diacritics-insensitive, inflection-tolerant matching).
