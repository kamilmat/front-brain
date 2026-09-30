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

### Gesture control

```ts
import { createVisionTask, runVideoLoop, GestureController } from '@front-brain/mediapipe';

const task = await createVisionTask('gesture');
const hands = new GestureController({ mirror: true });
runVideoLoop(video, canvas, task, undefined, (result, t) => {
  const { pointer, pinching, events } = hands.update(result, t);
  // events: { type: 'pinch' | 'pinchEnd', x, y } | { type: 'swipe', direction } | { type: 'gesture', name }
});
```

### Mood & blinks

```ts
import { createVisionTask, runVideoLoop, MoodTracker, BlinkDetector } from '@front-brain/mediapipe';

const task = await createVisionTask('face');
const mood = new MoodTracker();
const eyes = new BlinkDetector();
runVideoLoop(video, canvas, task, undefined, (result, t) => {
  const shapes = result.faceBlendshapes?.[0]?.categories;
  const { mood: m } = mood.update(shapes);         // happy | surprised | sad | angry | neutral
  const { blinks, blinksPerMinute, wink, closedMs } = eyes.update(shapes, t);
});
```
