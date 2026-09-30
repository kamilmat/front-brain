# @front-brain/mediapipe

Real-time [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) with one API for face landmarks, hands, pose, gestures, object detection and selfie segmentation, plus a video loop and drawing.

```ts
import { createVisionTask, runVideoLoop } from '@front-brain/mediapipe';

const task = await createVisionTask('hand', { delegate: 'GPU' });
const stop = runVideoLoop(videoEl, canvasEl, task, ({ fps, summary }) => console.log(fps, summary));
// later
stop();
task.close(); // or registry.unload(task.key)
```
