# @front-brain/inpaint

Object removal with [LaMa](https://github.com/advimman/lama) (ONNX, 512×512) on onnxruntime-web (WebGPU or WASM).

```ts
import { inpaint, loadLama, unloadLama, LAMA_SIZE } from '@front-brain/inpaint';

await loadLama('webgpu', { onProgress: (f) => console.log(f) }); // optional
const { image } = await inpaint('webgpu', imageData512, maskData512); // mask: alpha > 0 = fill
ctx.putImageData(image, 0, 0);
await unloadLama();
```
