# 🧠 Front Brain

A playground for testing AI models that run **entirely in the browser** (WebGPU / WebAssembly). No backend, no data leaves the device.

## What's inside

| Area | Demos | Engine |
|---|---|---|
| System | Environment check, Benchmark (WASM vs WebGPU × dtypes), Run log (JSON export) | – |
| LLM chat | WebLLM (Llama, Qwen, Phi, Gemma…), Transformers.js chat, Chrome built-in AI (Gemini Nano) | WebLLM, Transformers.js, Chrome AI APIs |
| Text | Sentiment, NER, zero-shot, fill-mask, QA, summarization, translation (NLLB-200), embeddings | Transformers.js |
| Image | Classification, CLIP, object detection, open-vocab detection, segmentation, depth, captioning/OCR, background removal, super-resolution, inpainting (LaMa) | Transformers.js, ONNX Runtime Web |
| Video | Live face/hand/pose/gesture/objects/selfie segmentation; any Transformers.js vision model frame by frame | MediaPipe, Transformers.js |
| Audio | Whisper / Moonshine ASR, TTS, audio classification | Transformers.js |

Every demo also takes a **custom Hugging Face model id**, a device (WebGPU/WASM) and a dtype (fp32, fp16, q8, q4, q4f16…).

## Will it run on a phone?

Models marked 📱 run fine on a typical mid-range phone (WASM, < ~300 MB). Rough guide:

- **OK anywhere:** MediaPipe (real time), small BERT-style text models, MiniLM embeddings, YOLOS/DETR, Depth Anything small, RMBG, Whisper tiny/base.
- **Recent flagship with WebGPU (Chrome on Android, Safari 26 on iOS):** 0.5–1B LLMs (SmolLM2, Qwen2.5-0.5B), Whisper small.
- **Desktop GPU:** 3B+ LLMs in WebLLM, Phi-3.5, Whisper large-v3-turbo, DepthPro.

Open **Environment check** on the device to see what's supported.

## Development

```bash
npm install --ignore-scripts   # skip native onnxruntime-node/sharp downloads (not needed in the browser)
npm run dev
npm run build                  # typecheck + production build
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site will be at `https://<user>.github.io/front-brain/`.

GitHub Pages can't send COOP/COEP headers, so multi-threaded WASM is off by default. It can be enabled on the Environment page (via `coi-serviceworker`).

## Architecture (ready to split into packages)

```
src/
  core/        framework-agnostic, no React – future `@front-brain/core`
    transformers/client.ts   runTjs(): run any Transformers.js pipeline in a Web Worker (progress, streaming, timings)
    transformers/worker.ts   the worker – caches pipelines by (task, model, device, dtype)
    webllm.worker.ts         WebLLM worker handler
    lama.ts                  LaMa inpainting on raw onnxruntime-web
    audio.ts                 decode audio → 16 kHz PCM, PCM → WAV
    env.ts                   capability detection (WebGPU, fp16, SIMD, threads, Chrome AI)
    runlog.ts                run/timing store (subscribe API)
    index.ts                 public API
  react/       React bindings – future `@front-brain/react` (useTjs, useModelChoice, useDemo, useRuns)
  components/  UI building blocks (model picker, progress, image/audio/video inputs, chat)
  demos/       the playground pages + registry.ts
```

Using the core in another project:

```ts
import { runTjs } from './core';

const { result, stats } = await runTjs(
  { task: 'text-classification', model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', device: 'wasm', args: ['I love this!'] },
  { onProgress: (p) => console.log(p) },
);
```
