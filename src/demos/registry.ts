import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface DemoDef {
  id: string;
  title: string;
  group: string;
  desc: string;
  lib: string;
  /** Works reasonably on a mid-range phone. */
  mobile?: boolean;
  component: LazyExoticComponent<ComponentType>;
}

const text = () => import('./text');
const llm = () => import('./llm');
const vision = () => import('./vision');
const audio = () => import('./audio');
const video = () => import('./video');
const system = () => import('./system');
const pick = <M,>(loader: () => Promise<M>, name: keyof M) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

export const DEMOS: DemoDef[] = [
  { id: 'env', group: 'System', title: 'Environment check', lib: '—', mobile: true, desc: 'What your device supports: WebGPU, fp16, threads, memory, Chrome built-in AI.', component: pick(system, 'Environment') },
  { id: 'bench', group: 'System', title: 'Benchmark', lib: 'Transformers.js', mobile: true, desc: 'Same model on WASM vs WebGPU and different dtypes – median latency.', component: pick(system, 'Benchmark') },
  { id: 'log', group: 'System', title: 'Run log', lib: '—', mobile: true, desc: 'All runs with load/inference timings. Export as JSON.', component: pick(system, 'RunLog') },

  { id: 'webllm', group: 'LLM chat', title: 'WebLLM chat', lib: 'WebLLM (MLC)', desc: 'Llama, Qwen, Phi, Gemma, Mistral… compiled for WebGPU. Fastest in-browser LLMs.', component: pick(llm, 'WebLLMChat') },
  { id: 'tjs-chat', group: 'LLM chat', title: 'Transformers.js chat', lib: 'Transformers.js', mobile: true, desc: 'Small ONNX LLMs (SmolLM2, Qwen, Llama 3.2, Gemma 3) with streaming.', component: pick(llm, 'TjsChat') },
  { id: 'chrome-ai', group: 'LLM chat', title: 'Chrome built-in AI', lib: 'Gemini Nano', desc: 'Prompt, Summarizer, Translator, Language detector, Writer, Rewriter APIs.', component: pick(llm, 'ChromeAI') },

  { id: 'sentiment', group: 'Text', title: 'Sentiment / toxicity', lib: 'Transformers.js', mobile: true, desc: 'Text classification.', component: pick(text, 'Sentiment') },
  { id: 'ner', group: 'Text', title: 'Named entities', lib: 'Transformers.js', mobile: true, desc: 'People, organizations, places.', component: pick(text, 'NER') },
  { id: 'zero-shot', group: 'Text', title: 'Zero-shot classification', lib: 'Transformers.js', mobile: true, desc: 'Classify into any labels you type.', component: pick(text, 'ZeroShot') },
  { id: 'fill-mask', group: 'Text', title: 'Fill the blank', lib: 'Transformers.js', mobile: true, desc: 'Masked language modelling (BERT).', component: pick(text, 'FillMask') },
  { id: 'qa', group: 'Text', title: 'Question answering', lib: 'Transformers.js', mobile: true, desc: 'Extract answers from a context.', component: pick(text, 'QA') },
  { id: 'summarize', group: 'Text', title: 'Summarization', lib: 'Transformers.js', desc: 'Abstractive summaries (BART, T5).', component: pick(text, 'Summarize') },
  { id: 'translate', group: 'Text', title: 'Translation', lib: 'Transformers.js', desc: 'NLLB-200: 200 languages incl. Polish.', component: pick(text, 'Translate') },
  { id: 'embeddings', group: 'Text', title: 'Embeddings & semantic search', lib: 'Transformers.js', mobile: true, desc: 'Sentence vectors + cosine similarity.', component: pick(text, 'Embeddings') },

  { id: 'img-cls', group: 'Image', title: 'Image classification', lib: 'Transformers.js', mobile: true, desc: 'ImageNet classes (ViT, ConvNeXt, ResNet).', component: pick(vision, 'ImageClassify') },
  { id: 'clip', group: 'Image', title: 'Zero-shot image (CLIP)', lib: 'Transformers.js', mobile: true, desc: 'Match images against any text labels.', component: pick(vision, 'ZeroShotImage') },
  { id: 'detect', group: 'Image', title: 'Object detection', lib: 'Transformers.js', mobile: true, desc: 'YOLOS, DETR, RF-DETR bounding boxes.', component: pick(vision, 'ObjectDetect') },
  { id: 'owl', group: 'Image', title: 'Open-vocabulary detection', lib: 'Transformers.js', desc: 'Find anything you describe (OWL-ViT).', component: pick(vision, 'ZeroShotDetect') },
  { id: 'segment', group: 'Image', title: 'Segmentation', lib: 'Transformers.js', mobile: true, desc: 'Semantic / panoptic / face parsing masks.', component: pick(vision, 'Segmentation') },
  { id: 'depth', group: 'Image', title: 'Depth estimation', lib: 'Transformers.js', mobile: true, desc: 'Depth Anything v2, DPT, DepthPro.', component: pick(vision, 'Depth') },
  { id: 'caption', group: 'Image', title: 'Captioning & OCR', lib: 'Transformers.js', mobile: true, desc: 'Describe images, read printed/handwritten text.', component: pick(vision, 'Caption') },
  { id: 'bg', group: 'Image', title: 'Background removal', lib: 'Transformers.js', mobile: true, desc: 'RMBG, MODNet, BiRefNet.', component: pick(vision, 'BackgroundRemoval') },
  { id: 'upscale', group: 'Image', title: 'Super-resolution', lib: 'Transformers.js', desc: 'Swin2SR 2×/4× upscaling.', component: pick(vision, 'SuperRes') },
  { id: 'inpaint', group: 'Image', title: 'Inpainting (object removal)', lib: 'ONNX Runtime Web', desc: 'Paint a mask, LaMa fills it in.', component: lazy(async () => ({ default: (await import('./inpaint')).Inpaint })) },

  { id: 'mediapipe', group: 'Video', title: 'Live: face, hands, pose, objects', lib: 'MediaPipe', mobile: true, desc: 'Real-time webcam / video file tracking at 30+ FPS.', component: pick(video, 'MediaPipeLive') },
  { id: 'tjs-video', group: 'Video', title: 'Any vision model on video', lib: 'Transformers.js', desc: 'Frame-by-frame detection, depth, classification, captioning.', component: pick(video, 'TjsVideo') },

  { id: 'asr', group: 'Audio', title: 'Speech to text', lib: 'Transformers.js', mobile: true, desc: 'Whisper (tiny → large-v3-turbo), Moonshine. Mic or file.', component: pick(audio, 'ASR') },
  { id: 'tts', group: 'Audio', title: 'Text to speech', lib: 'Transformers.js', mobile: true, desc: 'MMS-TTS, SpeechT5.', component: pick(audio, 'TTS') },
  { id: 'audio-cls', group: 'Audio', title: 'Audio classification', lib: 'Transformers.js', desc: 'What sound is it? (AudioSet).', component: pick(audio, 'AudioClassify') },
];
