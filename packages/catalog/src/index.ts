/**
 * Curated models known to work in the browser. Sizes are approximate downloads for the default dtype.
 * `mobile` = reasonable on a mid-range phone.
 */
export type Runtime = 'transformers' | 'webllm' | 'mediapipe' | 'onnx' | 'chrome-ai';

export interface CatalogModel {
  id: string;
  task: string;
  runtime: Runtime;
  sizeMB: number;
  dtype?: string;
  needsWebGPU?: boolean;
  needsF16?: boolean;
  mobile?: boolean;
  languages?: string;
  note?: string;
}

const t = (task: string, id: string, sizeMB: number, extra: Partial<CatalogModel> = {}): CatalogModel => ({ id, task, runtime: 'transformers', sizeMB, ...extra });

export const CATALOG: CatalogModel[] = [
  // ---- text
  t('text-classification', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', 67, { mobile: true, languages: 'en', note: 'Positive / negative.' }),
  t('text-classification', 'Xenova/bert-base-multilingual-uncased-sentiment', 170, { mobile: true, languages: 'en, de, fr, es, it, nl', note: '1–5 stars.' }),
  t('text-classification', 'Xenova/toxic-bert', 110, { mobile: true, languages: 'en', note: 'Toxicity – multi-label.' }),
  t('token-classification', 'Xenova/bert-base-NER', 110, { mobile: true, languages: 'en' }),
  t('token-classification', 'Xenova/bert-base-multilingual-cased-ner-hrl', 180, { languages: '10 languages' }),
  t('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', 25, { mobile: true, languages: 'en' }),
  t('zero-shot-classification', 'Xenova/nli-deberta-v3-xsmall', 90, { mobile: true, languages: 'en' }),
  t('zero-shot-classification', 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7', 280, { languages: '100+ incl. pl' }),
  t('fill-mask', 'Xenova/bert-base-uncased', 110, { mobile: true, languages: 'en' }),
  t('fill-mask', 'Xenova/distilbert-base-uncased', 67, { mobile: true, languages: 'en' }),
  t('fill-mask', 'Xenova/xlm-roberta-base', 280, { languages: '100 incl. pl' }),
  t('question-answering', 'Xenova/distilbert-base-cased-distilled-squad', 65, { mobile: true, languages: 'en' }),
  t('question-answering', 'Xenova/distilbert-base-uncased-distilled-squad', 65, { mobile: true, languages: 'en' }),
  t('summarization', 'Xenova/distilbart-cnn-6-6', 300, { languages: 'en' }),
  t('summarization', 'Xenova/t5-small', 60, { mobile: true, languages: 'en', note: 'Prefix "summarize: " is added automatically.' }),
  t('summarization', 'Xenova/bart-large-cnn', 400, { languages: 'en' }),
  t('translation', 'Xenova/nllb-200-distilled-600M', 900, { dtype: 'q8', languages: '200 incl. pl', note: 'Large download – WebGPU recommended.' }),
  t('feature-extraction', 'Xenova/all-MiniLM-L6-v2', 23, { mobile: true, languages: 'en' }),
  t('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', 120, { mobile: true, languages: '50 incl. pl' }),
  t('feature-extraction', 'Xenova/bge-small-en-v1.5', 34, { mobile: true, languages: 'en' }),

  // ---- LLM (Transformers.js)
  t('text-generation', 'HuggingFaceTB/SmolLM2-135M-Instruct', 120, { dtype: 'q4f16', mobile: true, needsF16: true, note: 'Smallest chat model – quality is limited.' }),
  t('text-generation', 'HuggingFaceTB/SmolLM2-360M-Instruct', 250, { dtype: 'q4f16', mobile: true, needsF16: true }),
  t('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', 400, { dtype: 'q4f16', needsF16: true, languages: 'multilingual incl. pl' }),
  t('text-generation', 'onnx-community/Qwen3-0.6B-ONNX', 500, { dtype: 'q4f16', needsF16: true, note: 'Reasoning model – emits <think> blocks.' }),
  t('text-generation', 'onnx-community/Llama-3.2-1B-Instruct-q4f16', 1100, { dtype: 'q4f16', needsF16: true, needsWebGPU: true }),
  t('text-generation', 'onnx-community/gemma-3-1b-it-ONNX', 1000, { dtype: 'q4f16', needsF16: true, needsWebGPU: true }),
  t('text-generation', 'onnx-community/Phi-3.5-mini-instruct-onnx-web', 2200, { dtype: 'q4f16', needsF16: true, needsWebGPU: true, note: 'Desktop GPU only.' }),

  // ---- vision
  t('image-classification', 'Xenova/vit-base-patch16-224', 90, { mobile: true }),
  t('image-classification', 'Xenova/convnext-tiny-224', 30, { mobile: true }),
  t('image-classification', 'Xenova/resnet-50', 25, { mobile: true }),
  t('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', 150, { mobile: true }),
  t('zero-shot-image-classification', 'Xenova/siglip-base-patch16-224', 200),
  t('object-detection', 'Xenova/yolos-tiny', 26, { mobile: true }),
  t('object-detection', 'Xenova/detr-resnet-50', 43, { mobile: true }),
  t('object-detection', 'onnx-community/rfdetr_base-ONNX', 130, { note: 'RF-DETR – state-of-the-art real-time detector.' }),
  t('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', 150),
  t('zero-shot-object-detection', 'Xenova/owlv2-base-patch16-ensemble', 160, { note: 'More accurate, slower.' }),
  t('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', 4, { mobile: true, note: 'Semantic, 150 ADE20K classes.' }),
  t('image-segmentation', 'Xenova/detr-resnet-50-panoptic', 45, { note: 'Panoptic (instances).' }),
  t('image-segmentation', 'Xenova/face-parsing', 4, { mobile: true, note: 'Face parts – use a portrait.' }),
  t('depth-estimation', 'onnx-community/depth-anything-v2-small', 27, { mobile: true }),
  t('depth-estimation', 'Xenova/dpt-hybrid-midas', 125),
  t('depth-estimation', 'onnx-community/DepthPro-ONNX', 1000, { dtype: 'q4', needsWebGPU: true, note: 'Apple DepthPro – metric depth, very heavy.' }),
  t('image-to-text', 'Xenova/vit-gpt2-image-captioning', 250, { mobile: true, note: 'Image captioning (en).' }),
  t('image-to-text', 'Xenova/trocr-small-printed', 60, { mobile: true, note: 'OCR – a single line of printed text.' }),
  t('image-to-text', 'Xenova/trocr-small-handwritten', 60, { mobile: true, note: 'OCR – a single line of handwriting.' }),
  t('background-removal', 'briaai/RMBG-1.4', 44, { mobile: true, note: 'Non-commercial license.' }),
  t('background-removal', 'Xenova/modnet', 7, { mobile: true, note: 'Portrait matting.' }),
  t('background-removal', 'onnx-community/BiRefNet_lite-ONNX', 220, { dtype: 'fp16', note: 'High quality, WebGPU recommended.' }),
  t('image-to-image', 'Xenova/swin2SR-classical-sr-x2-64', 4, { mobile: true, note: '2× upscale. Keep inputs < 512 px.' }),
  t('image-to-image', 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr', 17, { note: '4× upscale for real photos.' }),
  t('image-to-image', 'Xenova/swin2SR-compressed-sr-x4-48', 5, { note: '4× upscale + JPEG artifact removal.' }),
  { id: 'Carve/LaMa-ONNX', task: 'inpainting', runtime: 'onnx', sizeMB: 208, note: 'Object removal, fp32.' },

  // ---- audio
  t('automatic-speech-recognition', 'onnx-community/whisper-tiny', 40, { mobile: true, languages: '99' }),
  t('automatic-speech-recognition', 'onnx-community/whisper-base', 80, { mobile: true, languages: '99' }),
  t('automatic-speech-recognition', 'onnx-community/whisper-small', 250, { languages: '99', note: 'Much better for Polish.' }),
  t('automatic-speech-recognition', 'onnx-community/whisper-large-v3-turbo', 800, { dtype: 'q4', languages: '99', note: 'Best quality – WebGPU recommended.' }),
  t('automatic-speech-recognition', 'onnx-community/moonshine-base-ONNX', 60, { mobile: true, languages: 'en', note: 'Fast English ASR.' }),
  t('text-to-speech', 'Xenova/mms-tts-eng', 30, { mobile: true, languages: 'en' }),
  t('text-to-speech', 'Xenova/speecht5_tts', 150, { dtype: 'fp32', languages: 'en', note: 'Uses a default speaker embedding.' }),
  t('text-to-speech', 'Xenova/mms-tts-deu', 30, { mobile: true, languages: 'de' }),
  t('text-to-speech', 'Xenova/mms-tts-fra', 30, { mobile: true, languages: 'fr' }),
  t('audio-classification', 'Xenova/ast-finetuned-audioset-10-10-0.4593', 90, { note: '527 AudioSet classes.' }),
  t('audio-classification', 'Xenova/wav2vec2-large-xlsr-53-gender-recognition-librispeech', 320, { note: 'Speaker gender.' }),

  // ---- MediaPipe (real-time)
  { id: 'face_landmarker', task: 'mp:face', runtime: 'mediapipe', sizeMB: 4, mobile: true },
  { id: 'hand_landmarker', task: 'mp:hand', runtime: 'mediapipe', sizeMB: 8, mobile: true },
  { id: 'pose_landmarker_lite', task: 'mp:pose', runtime: 'mediapipe', sizeMB: 6, mobile: true },
  { id: 'gesture_recognizer', task: 'mp:gesture', runtime: 'mediapipe', sizeMB: 8, mobile: true },
  { id: 'efficientdet_lite0', task: 'mp:object', runtime: 'mediapipe', sizeMB: 7, mobile: true },
  { id: 'selfie_segmenter', task: 'mp:selfie', runtime: 'mediapipe', sizeMB: 0.3, mobile: true },
];

export const modelsForTask = (task: string) => CATALOG.filter((m) => m.task === task);
export const findModel = (id: string) => CATALOG.find((m) => m.id === id);
export const TASKS = [...new Set(CATALOG.map((m) => m.task))];
