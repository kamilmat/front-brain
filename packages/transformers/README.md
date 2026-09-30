# @front-brain/transformers

Run any [Transformers.js](https://huggingface.co/docs/transformers.js) pipeline in a Web Worker with explicit **load / unload**, download progress, token streaming and timings. Loaded pipelines appear in `@front-brain/core`'s `registry`.

```ts
import { getTransformersRuntime } from '@front-brain/transformers';

const rt = getTransformersRuntime();
const spec = { task: 'text-classification', model: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', device: 'wasm' as const };

await rt.load(spec, { onProgress: (p) => console.log(p.file, p.progress) }); // optional – run() auto-loads
const { result, stats } = await rt.run(spec, ['I love this!']);
await rt.unload(spec);
```

Streaming (LLMs, summarization, translation): `rt.run(spec, [messages], { max_new_tokens: 128 }, { stream: true, onToken: (t) => … })`.

Images / audio / tensors in results are serialized: `{ __image: { width, height, data } }`, `{ __audio: { audio, sampling_rate } }`, `{ __tensor: { dims, data } }`. Use `drawImage(img, canvas)`.

### Bundler notes

The runtime spawns `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.
With Vite, exclude the package from pre-bundling so the URL resolves:

```ts
optimizeDeps: { exclude: ['@huggingface/transformers', '@front-brain/transformers'] }
```

Or provide your own worker: create `my-worker.ts` containing `import '@front-brain/transformers/worker';` and pass
`new TransformersRuntime({ createWorker: () => new Worker(new URL('./my-worker.ts', import.meta.url), { type: 'module' }) })`.
