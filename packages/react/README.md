# @front-brain/react

React hooks for the `@front-brain/*` packages.

| Hook | Returns |
|---|---|
| `usePipeline(spec, { label })` | `{ load, unload, run, loaded, loading, busy, files, stats, error, streamText, entry }` for a Transformers.js pipeline |
| `useLoadedModels()` | live list of models in memory (all runtimes) |
| `useLoadedModel(key)` | one registry entry |
| `useHardware()` | `HardwareProfile` |
| `useFit(req, device, dtype)` | `FitAssessment` |
| `useCachedModels()` | `{ models, refresh, remove }` for downloaded weights |
| `useRuns()` | run log |

```tsx
const p = usePipeline({ task: 'object-detection', model: 'Xenova/yolos-tiny', device: 'webgpu' });
<button onClick={p.load} disabled={p.loaded}>Load</button>
<button onClick={() => p.run([imageUrl], { threshold: 0.5 })}>Detect</button>
<button onClick={p.unload}>Unload</button>
```
