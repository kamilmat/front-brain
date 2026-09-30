# @front-brain/core

Framework-agnostic building blocks for in-browser AI. No UI, no framework.

- **`getHardwareProfile()`** – WebGPU, shader-f16, GPU buffer limits, memory, cores, mobile → `tier` (`low | mid | high`) and a safe `budgetMB`.
- **`assessFit(requirements, hw, device?, dtype?)`** – advisory ✅/🟢/⚠️/🟥/⛔ fit with human-readable reasons and a suggested device. Never blocks.
- **`registry`** (`ModelRegistry`) – one list of models loaded in memory across all runtimes, with `unload(key)`, `unloadAll(runtime?)`, `subscribe()`.
- **Cache** – `listCachedModels()`, `deleteCachedModel()`, `clearAllCaches()`, `fetchCached(url, onProgress)`.
- **Run log** – `logRun()`, `getRuns()`, `subscribeRuns()` (localStorage).
- **Audio** – `decodeAudio(blob|url, 16000)` → mono Float32 PCM, `toWav(pcm, rate)`.
- **Env** – `detectEnv()`, `hasWebGPU()`.

```ts
import { getHardwareProfile, assessFit, registry } from '@front-brain/core';

const hw = await getHardwareProfile();
const fit = assessFit({ sizeMB: 400, needsF16: true }, hw, 'webgpu', 'q4f16');
console.log(fit.fit, fit.reasons);

registry.subscribe(() => console.log(registry.list()));
await registry.unloadAll();
```
