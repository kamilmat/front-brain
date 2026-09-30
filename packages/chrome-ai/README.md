# @front-brain/chrome-ai

Thin typed helpers around Chrome's built-in AI (Gemini Nano): `LanguageModel`, `Summarizer`, `Translator`, `LanguageDetector`, `Writer`, `Rewriter`, `Proofreader`.

```ts
import { availabilityAll, createSession, promptStreaming } from '@front-brain/chrome-ai';

console.log(await availabilityAll());
const lm = await createSession('LanguageModel', {}, (f) => console.log('download', f));
await promptStreaming(lm, 'Write a haiku about WebGPU', (text) => render(text));
```
