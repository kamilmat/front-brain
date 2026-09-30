import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface Section {
  id: string;
  title: string;
  icon: string;
  desc: string;
}

export interface DemoDef {
  id: string;
  section: string;
  title: string;
  desc: string;
  lib: string;
  /** Catalog task(s) this demo uses – links catalog models to demos. */
  tasks?: string[];
  mobile?: boolean;
  component: LazyExoticComponent<ComponentType>;
}

export const SECTIONS: Section[] = [
  { id: 'chat', title: 'Chat', icon: '💬', desc: 'Large language models: WebLLM, Transformers.js and Chrome built-in Gemini Nano.' },
  { id: 'text', title: 'Text', icon: '📝', desc: 'Classic NLP: classification, entities, QA, summaries, translation, embeddings.' },
  { id: 'image', title: 'Image', icon: '🖼️', desc: 'Recognition, detection, segmentation, depth, OCR, background removal, upscaling, inpainting.' },
  { id: 'video', title: 'Video', icon: '🎥', desc: 'Real-time tracking from the camera or a video file.' },
  { id: 'audio', title: 'Audio', icon: '🎙️', desc: 'Speech recognition, speech synthesis, sound classification.' },
  { id: 'lab', title: 'Lab', icon: '🧪', desc: 'Benchmarks and the run log for comparing models, devices and dtypes.' },
];

const text = () => import('./text');
const llm = () => import('./llm');
const vision = () => import('./vision');
const audio = () => import('./audio');
const video = () => import('./video');
const lab = () => import('./lab');
const inpaint = () => import('./inpaint');
const interactive = () => import('./interactive');
const pick = <M,>(loader: () => Promise<M>, name: keyof M) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

export const DEMOS: DemoDef[] = [
  { id: 'webllm', section: 'chat', title: 'WebLLM chat', lib: 'WebLLM (MLC)', desc: 'Llama, Qwen, Phi, Gemma, Mistral… compiled for WebGPU. The fastest in-browser LLMs.', component: pick(llm, 'WebLLMChat') },
  { id: 'tjs-chat', section: 'chat', title: 'Transformers.js chat', lib: 'Transformers.js', tasks: ['text-generation'], mobile: true, desc: 'Small ONNX LLMs (SmolLM2, Qwen, Llama 3.2, Gemma 3) with token streaming.', component: pick(llm, 'TjsChat') },
  { id: 'chrome-ai', section: 'chat', title: 'Chrome built-in AI', lib: 'Gemini Nano', desc: 'Prompt, Summarizer, Translator, Language detector, Writer and Rewriter APIs.', component: pick(llm, 'ChromeAI') },

  { id: 'sentiment', section: 'text', title: 'Sentiment & toxicity', lib: 'Transformers.js', tasks: ['text-classification'], mobile: true, desc: 'Text classification.', component: pick(text, 'Sentiment') },
  { id: 'ner', section: 'text', title: 'Named entities', lib: 'Transformers.js', tasks: ['token-classification'], mobile: true, desc: 'People, organizations and places.', component: pick(text, 'NER') },
  { id: 'zero-shot', section: 'text', title: 'Zero-shot classification', lib: 'Transformers.js', tasks: ['zero-shot-classification'], mobile: true, desc: 'Classify into any labels you type.', component: pick(text, 'ZeroShot') },
  { id: 'fill-mask', section: 'text', title: 'Fill the blank', lib: 'Transformers.js', tasks: ['fill-mask'], mobile: true, desc: 'Masked language modelling (BERT, XLM-R).', component: pick(text, 'FillMask') },
  { id: 'qa', section: 'text', title: 'Question answering', lib: 'Transformers.js', tasks: ['question-answering'], mobile: true, desc: 'Extract answers from a context.', component: pick(text, 'QA') },
  { id: 'summarize', section: 'text', title: 'Summarization', lib: 'Transformers.js', tasks: ['summarization'], desc: 'Abstractive summaries (BART, T5).', component: pick(text, 'Summarize') },
  { id: 'translate', section: 'text', title: 'Translation', lib: 'Transformers.js', tasks: ['translation'], desc: 'NLLB-200: 200 languages including Polish.', component: pick(text, 'Translate') },
  { id: 'embeddings', section: 'text', title: 'Semantic search', lib: 'Transformers.js', tasks: ['feature-extraction'], mobile: true, desc: 'Sentence embeddings + cosine similarity.', component: pick(text, 'Embeddings') },

  { id: 'classify', section: 'image', title: 'Image classification', lib: 'Transformers.js', tasks: ['image-classification'], mobile: true, desc: 'ImageNet classes (ViT, ConvNeXt, ResNet).', component: pick(vision, 'ImageClassify') },
  { id: 'clip', section: 'image', title: 'Zero-shot (CLIP)', lib: 'Transformers.js', tasks: ['zero-shot-image-classification'], mobile: true, desc: 'Match an image against any text labels.', component: pick(vision, 'ZeroShotImage') },
  { id: 'detect', section: 'image', title: 'Object detection', lib: 'Transformers.js', tasks: ['object-detection'], mobile: true, desc: 'YOLOS, DETR, RF-DETR bounding boxes.', component: pick(vision, 'ObjectDetect') },
  { id: 'owl', section: 'image', title: 'Find anything', lib: 'Transformers.js', tasks: ['zero-shot-object-detection'], desc: 'Open-vocabulary detection (OWL-ViT).', component: pick(vision, 'ZeroShotDetect') },
  { id: 'segment', section: 'image', title: 'Segmentation', lib: 'Transformers.js', tasks: ['image-segmentation'], mobile: true, desc: 'Semantic, panoptic and face-parsing masks.', component: pick(vision, 'Segmentation') },
  { id: 'depth', section: 'image', title: 'Depth estimation', lib: 'Transformers.js', tasks: ['depth-estimation'], mobile: true, desc: 'Depth Anything v2, DPT, DepthPro.', component: pick(vision, 'Depth') },
  { id: 'caption', section: 'image', title: 'Captioning & OCR', lib: 'Transformers.js', tasks: ['image-to-text'], mobile: true, desc: 'Describe images, read printed or handwritten text.', component: pick(vision, 'Caption') },
  { id: 'background', section: 'image', title: 'Background removal', lib: 'Transformers.js', tasks: ['background-removal'], mobile: true, desc: 'RMBG, MODNet, BiRefNet.', component: pick(vision, 'BackgroundRemoval') },
  { id: 'upscale', section: 'image', title: 'Super-resolution', lib: 'Transformers.js', tasks: ['image-to-image'], desc: 'Swin2SR 2× / 4× upscaling.', component: pick(vision, 'SuperRes') },
  { id: 'inpaint', section: 'image', title: 'Object removal', lib: 'ONNX Runtime Web', tasks: ['inpainting'], desc: 'Paint over something – LaMa fills the hole.', component: pick(inpaint, 'Inpaint') },

  { id: 'live', section: 'video', title: 'Live tracking', lib: 'MediaPipe', tasks: ['mp:face', 'mp:hand', 'mp:pose', 'mp:gesture', 'mp:object', 'mp:selfie'], mobile: true, desc: 'Face mesh, hands, pose, gestures, objects, selfie segmentation at 30+ FPS.', component: pick(video, 'MediaPipeLive') },
  { id: 'gestures', section: 'video', title: 'Gesture control', lib: 'MediaPipe', tasks: ['mp:gesture'], mobile: true, desc: 'Control the page with your hand: air cursor, pinch to click, swipe, gesture actions, sound effects and a theremin.', component: pick(interactive, 'GestureControl') },
  { id: 'mood', section: 'video', title: 'Mood & blink detector', lib: 'MediaPipe', tasks: ['mp:face'], mobile: true, desc: 'Live mood from facial expression, blink counter, winks and a drowsiness alarm.', component: pick(interactive, 'MoodBlink') },
  { id: 'frames', section: 'video', title: 'Any vision model on video', lib: 'Transformers.js', desc: 'Frame-by-frame detection, depth, classification or captioning.', component: pick(video, 'TjsVideo') },

  { id: 'asr', section: 'audio', title: 'Speech to text', lib: 'Transformers.js', tasks: ['automatic-speech-recognition'], mobile: true, desc: 'Whisper (tiny → large-v3-turbo), Moonshine. Microphone or file.', component: pick(audio, 'ASR') },
  { id: 'tts', section: 'audio', title: 'Text to speech', lib: 'Transformers.js', tasks: ['text-to-speech'], mobile: true, desc: 'MMS-TTS, SpeechT5.', component: pick(audio, 'TTS') },
  { id: 'sounds', section: 'audio', title: 'Sound classification', lib: 'Transformers.js', tasks: ['audio-classification'], desc: 'What sound is it? (AudioSet, 527 classes).', component: pick(audio, 'AudioClassify') },

  { id: 'benchmark', section: 'lab', title: 'Benchmark', lib: 'Transformers.js', mobile: true, desc: 'The same model on WASM vs WebGPU and different dtypes – median latency.', component: pick(lab, 'Benchmark') },
  { id: 'log', section: 'lab', title: 'Run log', lib: '—', mobile: true, desc: 'Every load and run with timings. Export as JSON.', component: pick(lab, 'RunLog') },
];

export const demoForTask = (task: string) => DEMOS.find((d) => d.tasks?.includes(task));
