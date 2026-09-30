# 🧠 Front Brain

A lab for testing AI models that run **entirely in the browser** (WebGPU / WebAssembly), and a set of small **`@front-brain/*` packages** you can drop into any front-end app.

## Playground (`apps/playground`)

| Section | What you can test | Engine |
|---|---|---|
| 💬 Chat | WebLLM (100+ LLMs), Transformers.js chat, Chrome built-in AI (Gemini Nano) | WebLLM, Transformers.js, Chrome AI |
| 📝 Text | Sentiment, NER, zero-shot, fill-mask, QA, summarization, translation (NLLB-200), semantic search | Transformers.js |
| 🖼️ Image | Classification, CLIP, detection, open-vocab detection, segmentation, depth, captioning/OCR, background removal, super-resolution, object removal (LaMa) | Transformers.js, ONNX Runtime Web |
| 🎥 Video | Live face / hands / pose / gestures / objects / selfie segmentation; **gesture control** (air cursor, pinch-click, swipe, gesture actions, sound effects, theremin); **mood & blink detector** (mood, blinks/min, winks, drowsiness alarm); any vision model frame-by-frame | MediaPipe, Transformers.js |
| 🎙️ Audio | **Voice commands** (live recognition + keyword actions, 3 engines: Web Speech, Whisper, Vosk), Whisper & Moonshine ASR, TTS, sound classification | Web Speech API, Transformers.js, Vosk |
| 🧪 Lab | Benchmark (WASM vs WebGPU × dtypes), run log with JSON export | – |
| 📦 Models | In memory (unload), downloaded (delete), catalog with per-device fit | – |
| 🖥️ Device | Hardware tier, WebGPU/fp16, memory budget, threads toggle | – |

- **Explicit load / unload** – every demo has a model panel with *Load* and *Unload*; the 🧠 dock in the top bar shows everything in memory across all runtimes.
- **Fit hints, never blocking** – each model gets ✅ / 🟢 / ⚠️ / 🟥 / ⛔ for *this* device (size vs memory budget, WebGPU, fp16) with reasons. You can still load anything.
- **📈 Live load monitor** – top-bar toggle: per-model busy % (time spent computing), calls/s and latency, UI FPS, main-thread lag, long tasks, JS heap, CPU pressure (Compute Pressure API), weights memory.
- **Use in your project** – every model panel has a `</>` button with copy-paste code for the selected model/device/dtype (with `@front-brain/*` or the plain library).
- **Any model** – pick from the catalog or type any Hugging Face ONNX model id; choose device and dtype.

### Will it run on a phone?

📱 marks models that are fine on a mid-range phone. Rough guide: MediaPipe, BERT-size text models, MiniLM, YOLOS/DETR, Depth Anything small, RMBG, Whisper tiny/base run anywhere; 0.5–1B LLMs need a recent flagship with WebGPU; 3B+ LLMs, Whisper large, DepthPro need a desktop GPU. The Device page tells you what your device can do.

## Packages (`packages/*`)

| Package | Purpose |
|---|---|
| [`@front-brain/core`](packages/core) | Hardware profile, fit assessment, cross-runtime model registry, activity tracking + perf monitor, cache management, run log, audio utils. No dependencies. |
| [`@front-brain/catalog`](packages/catalog) | Curated browser-ready models with size and requirements. |
| [`@front-brain/transformers`](packages/transformers) | Transformers.js pipelines in a Web Worker: load / run / unload, progress, streaming, timings. |
| [`@front-brain/webllm`](packages/webllm) | WebLLM chat in a Web Worker: model list, load / chat / unload. |
| [`@front-brain/mediapipe`](packages/mediapipe) | Real-time MediaPipe vision tasks + video loop + drawing; `GestureController` (pointer, pinch, swipe, gestures), `MoodTracker`, `BlinkDetector`. |
| [`@front-brain/chrome-ai`](packages/chrome-ai) | Chrome built-in AI (Gemini Nano) helpers. |
| [`@front-brain/inpaint`](packages/inpaint) | LaMa object removal on onnxruntime-web. |
| [`@front-brain/speech`](packages/speech) | Live speech recognition (Web Speech, on-device Whisper + VAD, Vosk), mic capture, `KeywordSpotter` for voice commands. |
| [`@front-brain/react`](packages/react) | React hooks: `usePipeline`, `useLoadedModels`, `useHardware`, `useFit`, `useCachedModels`, `useRuns`. |

Runtimes are peer dependencies – install only what you use (e.g. `@front-brain/transformers` + `@huggingface/transformers`). Each package is plain ESM + `.d.ts`, framework-agnostic except `react`. See each package's README.

```ts
import { getTransformersRuntime } from '@front-brain/transformers';
import { registry, getHardwareProfile, assessFit } from '@front-brain/core';

const rt = getTransformersRuntime();
const spec = { task: 'automatic-speech-recognition', model: 'onnx-community/whisper-base', device: 'webgpu' as const };
console.log(assessFit({ sizeMB: 80 }, await getHardwareProfile(), spec.device));
await rt.load(spec);
const { result } = await rt.run(spec, [pcm16k]);
await registry.unloadAll();
```

## Development

```bash
npm install --ignore-scripts   # skips native onnxruntime-node / sharp downloads (browser-only)
npm run dev                    # builds packages, starts the playground
npm run watch:packages         # (second terminal) rebuild packages on change
npm run build                  # packages + playground production build
```

Publishing a package: `npm run build:packages && npm publish -w @front-brain/core` (etc.).

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes `apps/playground/dist` on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. URL: `https://<user>.github.io/front-brain/`.

GitHub Pages can't send COOP/COEP headers, so multi-threaded WASM is off by default; enable it on the Device page (uses `coi-serviceworker`).
