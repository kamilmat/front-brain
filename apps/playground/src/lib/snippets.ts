/**
 * Copy-paste code for using the currently selected model in another front-end project.
 * Every snippet comes in two flavours: with the @front-brain/* packages, and with the plain upstream library.
 */

export interface Snippet {
  id: string;
  label: string;
  install: string;
  code: string;
  notes?: string[];
}

const SAMPLE_IMG = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg';
const SAMPLE_WAV = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';

const PKG_NOTE =
  '@front-brain/* packages live in this repo (packages/*) and are not published to npm yet – copy the package folders into your project (or a workspace) until they are.';
const VITE_NOTE =
  "Vite: add the package to optimizeDeps.exclude (e.g. ['@huggingface/transformers', '@front-brain/transformers']) so the bundled Web Worker URL resolves.";

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

interface TaskExample {
  /** JS source of the positional arguments (without surrounding brackets). */
  args: string;
  /** JS source of the options object, if any. */
  options?: string;
  /** Short comment describing the output. */
  output: string;
  /** Code that prepares inputs (runs before the call). */
  prelude?: { frontBrain?: string; plain?: string };
  /** Plain-library import additions. */
  plainImports?: string[];
  stream?: boolean;
  /** How to read an image/audio result. */
  resultFrontBrain?: string;
  resultPlain?: string;
}

const TEXT = `'Running AI directly in the browser is fast and private.'`;

const EXAMPLES: Record<string, TaskExample> = {
  'text-classification': { args: `'I love how fast this runs in my browser!'`, options: '{ top_k: null }', output: '[{ label, score }, …]' },
  'token-classification': { args: `'Kamil works at Google in Warsaw.'`, output: '[{ entity, word, score, index }, …] (B-/I- tags per token)' },
  'zero-shot-classification': {
    args: `'The battery dies by noon.', ['complaint', 'praise', 'technology']`,
    options: '{ multi_label: true }',
    output: '{ labels: [...], scores: [...] }',
  },
  'fill-mask': { args: `'The capital of Poland is [MASK].'`, options: '{ top_k: 5 }', output: '[{ token_str, score, sequence }, …] – use the model’s own mask token ([MASK] or <mask>)' },
  'question-answering': { args: `'Where do the models run?', 'All models run locally in the web browser.'`, output: '{ answer, score }' },
  summarization: { args: TEXT, options: '{ max_new_tokens: 120 }', output: '[{ summary_text }]', stream: true },
  translation: { args: `'Cześć, jak się masz?'`, options: "{ src_lang: 'pol_Latn', tgt_lang: 'eng_Latn' }", output: '[{ translation_text }]', stream: true },
  'feature-extraction': {
    args: `['first sentence', 'second sentence']`,
    options: "{ pooling: 'mean', normalize: true }",
    output: 'Tensor [2, dim] – normalized, so cosine similarity = dot product',
    resultFrontBrain: 'const { dims, data } = result.__tensor; // flat number[]',
    resultPlain: 'const vectors = out.tolist(); // number[][]',
  },
  'text-generation': {
    args: `[{ role: 'user', content: 'Explain WebGPU in one sentence.' }]`,
    options: '{ max_new_tokens: 256 }',
    output: '[{ generated_text: [...messages, { role: "assistant", content }] }]',
    stream: true,
  },
  'image-classification': { args: q(SAMPLE_IMG), options: '{ top_k: 5 }', output: '[{ label, score }, …]' },
  'zero-shot-image-classification': { args: `${q(SAMPLE_IMG)}, ['a photo of cats', 'a photo of a dog']`, output: '[{ label, score }, …]' },
  'object-detection': { args: q(SAMPLE_IMG), options: '{ threshold: 0.5, percentage: true }', output: '[{ label, score, box: { xmin, ymin, xmax, ymax } }, …] (0–1 when percentage: true)' },
  'zero-shot-object-detection': { args: `${q(SAMPLE_IMG)}, ['cat', 'remote control']`, options: '{ threshold: 0.1, percentage: true }', output: '[{ label, score, box }, …]' },
  'image-segmentation': {
    args: q(SAMPLE_IMG),
    output: '[{ label, score, mask }, …]',
    resultFrontBrain: "drawImage(result[0].mask.__image, canvas); // import { drawImage } from '@front-brain/transformers'",
    resultPlain: 'document.body.append(out[0].mask.toCanvas());',
  },
  'depth-estimation': {
    args: q(SAMPLE_IMG),
    output: '{ predicted_depth: Tensor, depth: image }',
    resultFrontBrain: "drawImage(result.depth.__image, canvas); // import { drawImage } from '@front-brain/transformers'",
    resultPlain: 'document.body.append(out.depth.toCanvas());',
  },
  'image-to-text': { args: q(SAMPLE_IMG), options: '{ max_new_tokens: 64 }', output: '[{ generated_text }]', stream: true },
  'background-removal': {
    args: q(SAMPLE_IMG),
    output: 'RGBA image with transparent background (an array when you pass an array of images)',
    resultFrontBrain: "drawImage(result.__image, canvas); // import { drawImage } from '@front-brain/transformers'",
    resultPlain: 'document.body.append(out.toCanvas());',
  },
  'image-to-image': {
    args: q(SAMPLE_IMG),
    output: 'upscaled image (an array when you pass an array of images)',
    resultFrontBrain: "drawImage(result.__image, canvas); // import { drawImage } from '@front-brain/transformers'",
    resultPlain: 'document.body.append(out.toCanvas());',
  },
  'automatic-speech-recognition': {
    args: 'audio',
    options: '{ chunk_length_s: 30, stride_length_s: 5 } // Whisper: add language: "polish"',
    output: '{ text, chunks? }',
    prelude: {
      frontBrain: `// 16 kHz mono Float32Array from a URL, File or recorded Blob\nconst audio = await decodeAudio(${q(SAMPLE_WAV)}); // import { decodeAudio } from '@front-brain/core'`,
      plain: `const audio = await read_audio(${q(SAMPLE_WAV)}, 16000);`,
    },
    plainImports: ['read_audio'],
  },
  'text-to-speech': {
    args: `'Hello from your browser!'`,
    output: '{ audio: Float32Array, sampling_rate }',
    resultFrontBrain:
      "const { audio, sampling_rate } = result.__audio;\nconst url = URL.createObjectURL(toWav(audio, sampling_rate)); // import { toWav } from '@front-brain/core'\nnew Audio(url).play();",
    resultPlain: "const url = URL.createObjectURL(out.toBlob());\nnew Audio(url).play();",
  },
  'audio-classification': {
    args: 'audio',
    options: '{ top_k: 5 }',
    output: '[{ label, score }, …]',
    prelude: {
      frontBrain: `const audio = await decodeAudio(${q(SAMPLE_WAV)}); // import { decodeAudio } from '@front-brain/core'`,
      plain: `const audio = await read_audio(${q(SAMPLE_WAV)}, 16000);`,
    },
    plainImports: ['read_audio'],
  },
};

export interface PipelineChoice {
  task: string;
  model: string;
  device: 'webgpu' | 'wasm';
  dtype?: string;
}

function specLiteral(c: PipelineChoice) {
  return `{ task: ${q(c.task)}, model: ${q(c.model)}, device: ${q(c.device)}${c.dtype ? `, dtype: ${q(c.dtype)}` : ''} }`;
}

/** Snippets for a Transformers.js pipeline: @front-brain vanilla, @front-brain React, plain Transformers.js. */
const SPEAKER_EMB = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

export function transformersSnippets(c: PipelineChoice): Snippet[] {
  let ex = EXAMPLES[c.task] ?? { args: TEXT, output: 'see the Transformers.js docs for this task' };
  // SpeechT5 needs a speaker embedding.
  if (c.task === 'text-to-speech' && /speecht5/i.test(c.model)) ex = { ...ex, options: `{ speaker_embeddings: ${q(SPEAKER_EMB)} }` };
  const callArgs = `[${ex.args}]`;
  const opt = ex.options ? `, ${ex.options.split(' //')[0]}` : '';
  const optComment = ex.options?.includes('//') ? ` //${ex.options.split('//')[1]}` : '';
  const streamOpt = ex.stream ? `${ex.options ? '' : ', {}'}, { stream: true, onToken: (t) => console.log(t) }` : '';

  const vanilla = [
    `import { getTransformersRuntime } from '@front-brain/transformers';`,
    ``,
    `const rt = getTransformersRuntime(); // one Web Worker for the whole app`,
    `const spec = ${specLiteral(c)};`,
    ``,
    `// Optional: download + initialise up front (run() also auto-loads)`,
    `await rt.load(spec, { onProgress: (p) => p.status === 'progress' && console.log(p.file, Math.round(p.progress), '%') });`,
    ``,
    ...(ex.prelude?.frontBrain ? [ex.prelude.frontBrain, ''] : []),
    `const { result, stats } = await rt.run(spec, ${callArgs}${opt}${streamOpt});${optComment}`,
    `// result: ${ex.output}`,
    ...(ex.resultFrontBrain ? [ex.resultFrontBrain] : []),
    `console.log(result, \`\${stats.inferMs.toFixed(0)} ms\`);`,
    ``,
    `// Free memory when done (weights stay cached on disk)`,
    `await rt.unload(spec);`,
  ].join('\n');

  const react = [
    `import { useState } from 'react';`,
    `import { usePipeline } from '@front-brain/react';`,
    ...(ex.prelude?.frontBrain ? [`import { decodeAudio } from '@front-brain/core';`] : []),
    ``,
    `export function MyModel() {`,
    `  const p = usePipeline(${specLiteral(c)});`,
    `  const [out, setOut] = useState(null);`,
    ``,
    `  async function run() {`,
    ...(ex.prelude?.frontBrain ? [`    ${ex.prelude.frontBrain.split('\n').pop()!.replace(/ \/\/.*$/, '')}`] : []),
    `    setOut(await p.run(${callArgs}${opt}${ex.stream ? `${ex.options ? '' : ', {}'}, { stream: true }` : ''}));`,
    `  }`,
    ``,
    `  return (`,
    `    <>`,
    `      <button onClick={p.load} disabled={p.loaded || p.loading}>{p.loading ? 'Loading…' : 'Load'}</button>`,
    `      <button onClick={run} disabled={p.busy}>Run</button>`,
    `      <button onClick={p.unload} disabled={!p.entry}>Unload</button>`,
    ...(ex.stream ? [`      {p.busy && <p>{p.streamText}</p>}`] : []),
    `      {p.error && <pre>{p.error}</pre>}`,
    `      {out && <pre>{JSON.stringify(out, null, 2)}</pre>}`,
    `    </>`,
    `  );`,
    `}`,
  ].join('\n');

  const imports = ['pipeline', ...(ex.stream ? ['TextStreamer'] : []), ...(ex.plainImports ?? [])];
  const plain = [
    `import { ${imports.join(', ')} } from '@huggingface/transformers';`,
    ``,
    `// Tip: run this inside a Web Worker to keep the UI responsive.`,
    `const pipe = await pipeline(${q(c.task)}, ${q(c.model)}, {`,
    `  device: ${q(c.device)},${c.dtype ? `\n  dtype: ${q(c.dtype)},` : ''}`,
    `  progress_callback: (p) => p.status === 'progress' && console.log(p.file, Math.round(p.progress), '%'),`,
    `});`,
    ``,
    ...(ex.prelude?.plain ? [ex.prelude.plain, ''] : []),
    ...(ex.stream
      ? [
          `const streamer = new TextStreamer(pipe.tokenizer, { skip_prompt: true, callback_function: (t) => console.log(t) });`,
          `const out = await pipe(${ex.args}, { ...${ex.options ?? '{}'}, streamer });`,
        ]
      : [
          `const out = await pipe(${c.task === 'fill-mask' ? '`The capital of Poland is ${pipe.tokenizer.mask_token}.`' : ex.args}${ex.options ? `, ${ex.options.split(' //')[0]}` : ''});${optComment}`,
        ]),
    `// out: ${ex.output}`,
    ...(ex.resultPlain ? [ex.resultPlain] : []),
    ``,
    `await pipe.dispose(); // free memory`,
  ].join('\n');

  const dtypeNote = c.dtype && /f16/.test(c.dtype) ? ['q4f16 / fp16 weights need WebGPU with shader-f16; on WASM use q4 or q8.'] : [];
  return [
    { id: 'fb', label: '@front-brain (TS)', install: 'npm i @front-brain/transformers @huggingface/transformers', code: vanilla, notes: [PKG_NOTE, VITE_NOTE, ...dtypeNote] },
    { id: 'fb-react', label: '@front-brain (React)', install: 'npm i @front-brain/react @front-brain/transformers @huggingface/transformers', code: react, notes: [PKG_NOTE, VITE_NOTE, ...dtypeNote] },
    { id: 'plain', label: 'Plain Transformers.js', install: 'npm i @huggingface/transformers', code: plain, notes: dtypeNote },
  ];
}

export function webllmSnippets(model: string): Snippet[] {
  return [
    {
      id: 'fb',
      label: '@front-brain (TS)',
      install: 'npm i @front-brain/webllm @mlc-ai/web-llm',
      code: [
        `import { getWebLLMRuntime } from '@front-brain/webllm';`,
        ``,
        `const llm = getWebLLMRuntime(); // runs in a Web Worker, needs WebGPU`,
        `await llm.load(${q(model)}, (p) => console.log(p.text));`,
        ``,
        `const r = await llm.chat(`,
        `  [{ role: 'user', content: 'Explain WebGPU in one sentence.' }],`,
        `  { onToken: (_delta, full) => console.log(full), temperature: 0.7 },`,
        `);`,
        `console.log(r.text, r.decodeTps, 'tok/s');`,
        ``,
        `await llm.unload();`,
      ].join('\n'),
      notes: [PKG_NOTE, "Vite: add '@front-brain/webllm' to optimizeDeps.exclude."],
    },
    {
      id: 'plain',
      label: 'Plain WebLLM',
      install: 'npm i @mlc-ai/web-llm',
      code: [
        `import { CreateMLCEngine } from '@mlc-ai/web-llm';`,
        ``,
        `const engine = await CreateMLCEngine(${q(model)}, {`,
        `  initProgressCallback: (p) => console.log(p.text),`,
        `});`,
        ``,
        `const chunks = await engine.chat.completions.create({`,
        `  messages: [{ role: 'user', content: 'Explain WebGPU in one sentence.' }],`,
        `  stream: true,`,
        `});`,
        `let text = '';`,
        `for await (const c of chunks) text += c.choices[0]?.delta?.content ?? '';`,
        `console.log(text);`,
        ``,
        `await engine.unload();`,
      ].join('\n'),
      notes: ['For a non-blocking UI use CreateWebWorkerMLCEngine with a worker that runs WebWorkerMLCEngineHandler.'],
    },
  ];
}

export function mediapipeSnippets(kind: string, delegate: 'GPU' | 'CPU', modelUrl: string): Snippet[] {
  const cls: Record<string, [string, string, string]> = {
    face: ['FaceLandmarker', 'detectForVideo', 'numFaces: 2, outputFaceBlendshapes: true'],
    hand: ['HandLandmarker', 'detectForVideo', 'numHands: 2'],
    pose: ['PoseLandmarker', 'detectForVideo', 'numPoses: 1'],
    gesture: ['GestureRecognizer', 'recognizeForVideo', 'numHands: 2'],
    object: ['ObjectDetector', 'detectForVideo', 'scoreThreshold: 0.4'],
    selfie: ['ImageSegmenter', 'segmentForVideo', 'outputCategoryMask: true'],
  };
  const [C, method, opts] = cls[kind] ?? cls.face;
  return [
    {
      id: 'fb',
      label: '@front-brain (TS)',
      install: 'npm i @front-brain/mediapipe @mediapipe/tasks-vision',
      code: [
        `import { createVisionTask, runVideoLoop } from '@front-brain/mediapipe';`,
        ``,
        `const video = document.querySelector('video');   // playing webcam or file`,
        `const canvas = document.querySelector('canvas'); // overlay on top of the video`,
        ``,
        `const task = await createVisionTask(${q(kind)}, { delegate: ${q(delegate)} });`,
        `const stop = runVideoLoop(video, canvas, task, ({ fps, summary }) => console.log(fps, summary));`,
        ``,
        `// later`,
        `stop();`,
        `task.close();`,
      ].join('\n'),
      notes: [PKG_NOTE],
    },
    {
      id: 'plain',
      label: 'Plain MediaPipe',
      install: 'npm i @mediapipe/tasks-vision',
      code: [
        `import { FilesetResolver, ${C} } from '@mediapipe/tasks-vision';`,
        ``,
        `const fileset = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm') // match your installed version;`,
        `const task = await ${C}.createFromOptions(fileset, {`,
        `  baseOptions: { modelAssetPath: ${q(modelUrl)}, delegate: ${q(delegate)} },`,
        `  runningMode: 'VIDEO',`,
        `  ${opts},`,
        `});`,
        ``,
        `const video = document.querySelector('video');`,
        `function loop() {`,
        `  const result = task.${method}(video, performance.now());`,
        `  // draw result… (see DrawingUtils)`,
        `  requestAnimationFrame(loop);`,
        `}`,
        `loop();`,
      ].join('\n'),
    },
  ];
}

export function inpaintSnippets(device: 'webgpu' | 'wasm'): Snippet[] {
  return [
    {
      id: 'fb',
      label: '@front-brain (TS)',
      install: 'npm i @front-brain/inpaint onnxruntime-web',
      code: [
        `import { inpaint, loadLama, unloadLama, LAMA_SIZE } from '@front-brain/inpaint';`,
        ``,
        `// image + mask: 512×512 ImageData (mask pixels with alpha > 0 are filled)`,
        `const image = imageCtx.getImageData(0, 0, LAMA_SIZE, LAMA_SIZE);`,
        `const mask = maskCtx.getImageData(0, 0, LAMA_SIZE, LAMA_SIZE);`,
        ``,
        `await loadLama(${q(device)}, { onProgress: (f) => console.log(Math.round(f * 100), '%') }); // optional`,
        `const { image: result, inferMs } = await inpaint(${q(device)}, image, mask);`,
        `outCtx.putImageData(result, 0, 0);`,
        ``,
        `await unloadLama();`,
      ].join('\n'),
      notes: [PKG_NOTE],
    },
    {
      id: 'plain',
      label: 'Plain ONNX Runtime Web',
      install: 'npm i onnxruntime-web',
      code: [
        `import * as ort from 'onnxruntime-web${device === 'webgpu' ? '/webgpu' : ''}';`,
        ``,
        `const session = await ort.InferenceSession.create(`,
        `  'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',`,
        `  { executionProviders: [${q(device)}] },`,
        `);`,
        `// image: Float32Array [1,3,512,512] in 0..1 (planar RGB), mask: Float32Array [1,1,512,512] of 0/1`,
        `const res = await session.run({`,
        `  [session.inputNames[0]]: new ort.Tensor('float32', image, [1, 3, 512, 512]),`,
        `  [session.inputNames[1]]: new ort.Tensor('float32', mask, [1, 1, 512, 512]),`,
        `});`,
        `const out = res[session.outputNames[0]].data; // planar RGB, 0..255`,
        `await session.release();`,
      ].join('\n'),
    },
  ];
}

export function chromeAISnippets(api: string): Snippet[] {
  const create: Record<string, [string, string]> = {
    LanguageModel: ['{}', `const text = await session.prompt('Write a haiku about WebGPU');`],
    Summarizer: [`{ type: 'key-points', format: 'markdown', length: 'medium' }`, 'const text = await session.summarize(longText);'],
    Translator: [`{ sourceLanguage: 'en', targetLanguage: 'pl' }`, `const text = await session.translate('Hello!');`],
    LanguageDetector: ['{}', `const [top] = await session.detect('Dzień dobry');`],
    Writer: [`{ tone: 'neutral' }`, `const text = await session.write('A short product description for a smart lamp');`],
    Rewriter: [`{ tone: 'more-formal' }`, `const text = await session.rewrite('hey, can u send me the file?');`],
  };
  const [opts, call] = create[api] ?? create.LanguageModel;
  return [
    {
      id: 'fb',
      label: '@front-brain (TS)',
      install: 'npm i @front-brain/chrome-ai',
      code: [
        `import { availability, createSession } from '@front-brain/chrome-ai';`,
        ``,
        `const state = await availability(${q(api)}${api === 'Translator' ? `, ${opts}` : ''});`,
        `if (state === 'available' || state === 'downloadable' || state === 'downloading') {`,
        `  const session = await createSession(${q(api)}, ${opts}, (f) => console.log('download', f));`,
        `  ${call}`,
        `}`,
      ].join('\n'),
      notes: [PKG_NOTE],
    },
    {
      id: 'plain',
      label: 'Plain Chrome API',
      install: '# no install – built into Chrome 138+ (desktop)',
      code: [
        `const state = '${api}' in self ? await ${api}.availability(${api === 'Translator' ? opts : ''}) : 'unavailable';`,
        `if (state !== 'unavailable') {`,
        `  const session = await ${api}.create({`,
        `    ...${opts},`,
        `    monitor: (m) => m.addEventListener('downloadprogress', (e) => console.log(e.loaded)),`,
        `  });`,
        `  ${call}`,
        `}`,
      ].join('\n'),
    },
  ];
}
