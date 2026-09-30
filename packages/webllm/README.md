# @front-brain/webllm

[WebLLM](https://github.com/mlc-ai/web-llm) chat in a Web Worker with explicit load / unload and registry integration.

```ts
import { getWebLLMRuntime, listWebLLMModels } from '@front-brain/webllm';

const models = await listWebLLMModels(); // [{ id, vramMB, lowResource }]
const llm = getWebLLMRuntime();
await llm.load('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', (p) => console.log(p.text));
const r = await llm.chat([{ role: 'user', content: 'Hi!' }], { onToken: (_, full) => render(full) });
console.log(r.decodeTps, 'tok/s');
await llm.unload();
```

Requires WebGPU. Vite: add `'@front-brain/webllm'` to `optimizeDeps.exclude` (worker URL), or pass `createWorker` with a worker that imports `@front-brain/webllm/worker`.
