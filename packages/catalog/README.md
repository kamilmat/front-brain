# @front-brain/catalog

Curated list of browser-ready models (Transformers.js / ONNX / MediaPipe) with approximate size, dtype and hardware needs.

```ts
import { modelsForTask, CATALOG } from '@front-brain/catalog';
import { assessFit, getHardwareProfile } from '@front-brain/core';

const hw = await getHardwareProfile();
const asr = modelsForTask('automatic-speech-recognition').map((m) => ({ ...m, fit: assessFit(m, hw) }));
```
