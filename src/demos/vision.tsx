import { useEffect, useRef, useState } from 'react';
import { Card, ScoreBars, TjsPanel } from '../components/ui';
import { ImageInput, SAMPLE_IMAGES } from '../components/inputs';
import { useDemo } from '../react/useDemo';
import { imageToCanvas, type SerializedImage } from '../core/transformers/client';

const flat = (r: any) => [r].flat(2);
export const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#800000', '#aaffc3', '#808000', '#000075'];

function useImage(initial = SAMPLE_IMAGES[0].url) {
  return useState(initial);
}

export function ImagePreview({ src, children }: { src: string; children?: React.ReactNode }) {
  return (
    <div className="img-wrap">
      <img src={src} crossOrigin="anonymous" alt="" />
      {children}
    </div>
  );
}

export function Boxes({ items }: { items: { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }[] }) {
  const colors = new Map<string, string>();
  return (
    <>
      {items.map((o, i) => {
        if (!colors.has(o.label)) colors.set(o.label, PALETTE[colors.size % PALETTE.length]);
        const c = colors.get(o.label)!;
        const b = o.box;
        return (
          <div key={i} className="box" style={{ left: `${b.xmin * 100}%`, top: `${b.ymin * 100}%`, width: `${(b.xmax - b.xmin) * 100}%`, height: `${(b.ymax - b.ymin) * 100}%`, borderColor: c }}>
            <span style={{ background: c }}>
              {o.label} {(o.score * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </>
  );
}

export function CanvasImage({ img, className }: { img: SerializedImage; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) imageToCanvas(img, ref.current);
  }, [img]);
  return <canvas ref={ref} className={className ?? 'result-img'} />;
}

export function ImageClassify() {
  const d = useDemo('Image classification', 'image-classification', [
    { id: 'Xenova/vit-base-patch16-224', size: '90 MB (q8)', mobile: true },
    { id: 'Xenova/convnext-tiny-224', size: '30 MB (q8)', mobile: true },
    { id: 'Xenova/resnet-50', size: '25 MB (q8)', mobile: true },
  ]);
  const [img, setImg] = useImage();
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img], { top_k: 5 })))} output={out && <Card title="Top-5"><ScoreBars items={out} /></Card>}>
      <ImageInput value={img} onChange={setImg} />
      <ImagePreview src={img} />
    </TjsPanel>
  );
}

export function ZeroShotImage() {
  const d = useDemo('Zero-shot image (CLIP)', 'zero-shot-image-classification', [
    { id: 'Xenova/clip-vit-base-patch32', size: '150 MB (q8)', mobile: true },
    { id: 'Xenova/siglip-base-patch16-224', size: '200 MB (q8)' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[1].url);
  const [labels, setLabels] = useState('a tiger, a cat, a dog, a car, a painting, a photo of food');
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => setOut(flat(await d.tjs.run([img, labels.split(',').map((s) => s.trim()).filter(Boolean)])))}
      output={out && <Card title="Scores"><ScoreBars items={out} /></Card>}
    >
      <ImageInput value={img} onChange={setImg} />
      <label>
        Labels (comma-separated)
        <input value={labels} onChange={(e) => setLabels(e.target.value)} />
      </label>
      <ImagePreview src={img} />
    </TjsPanel>
  );
}

export function ObjectDetect() {
  const d = useDemo('Object detection', 'object-detection', [
    { id: 'Xenova/yolos-tiny', size: '26 MB (q8)', mobile: true },
    { id: 'Xenova/detr-resnet-50', size: '43 MB (q8)', mobile: true },
    { id: 'onnx-community/rfdetr_base-ONNX', size: '~130 MB', note: 'RF-DETR – state-of-the-art real-time detector.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[2].url);
  const [threshold, setThreshold] = useState(0.6);
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img], { threshold, percentage: true })))}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <label>
        threshold {threshold}
        <input type="range" min={0.05} max={0.95} step={0.05} value={threshold} onChange={(e) => setThreshold(+e.target.value)} />
      </label>
      <ImagePreview src={img}>{out && <Boxes items={out} />}</ImagePreview>
      {out && <p className="hint">{out.length} objects</p>}
    </TjsPanel>
  );
}

export function ZeroShotDetect() {
  const d = useDemo('Open-vocabulary detection', 'zero-shot-object-detection', [
    { id: 'Xenova/owlvit-base-patch32', size: '150 MB (q8)' },
    { id: 'Xenova/owlv2-base-patch16-ensemble', size: '160 MB (q8)', note: 'More accurate, slower.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[3].url);
  const [labels, setLabels] = useState('football, person, goal, shoe');
  const [out, setOut] = useState<any[] | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img, labels.split(',').map((s) => s.trim())], { threshold: 0.1, percentage: true })))}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <label>
        What to find (comma-separated, free text)
        <input value={labels} onChange={(e) => setLabels(e.target.value)} />
      </label>
      <ImagePreview src={img}>{out && <Boxes items={out} />}</ImagePreview>
    </TjsPanel>
  );
}

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function Segmentation() {
  const d = useDemo('Image segmentation', 'image-segmentation', [
    { id: 'Xenova/segformer-b0-finetuned-ade-512-512', size: '4 MB (q8)', mobile: true, note: 'Semantic, 150 ADE20K classes.' },
    { id: 'Xenova/detr-resnet-50-panoptic', size: '45 MB (q8)', note: 'Panoptic (instances).' },
    { id: 'Xenova/face-parsing', size: '4 MB', mobile: true, note: 'Face parts – try a portrait.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[2].url);
  const [out, setOut] = useState<{ label: string; score: number | null; mask: { __image: SerializedImage } }[] | null>(null);
  const [overlay, setOverlay] = useState<SerializedImage | null>(null);

  useEffect(() => {
    if (!out?.length) return setOverlay(null);
    const { width, height } = out[0].mask.__image;
    const data = new Uint8ClampedArray(width * height * 4);
    out.forEach((seg, i) => {
      const [r, g, b] = hexToRgb(PALETTE[i % PALETTE.length]);
      const m = seg.mask.__image.data;
      for (let p = 0; p < width * height; p++) {
        if (m[p * 4] > 127) {
          data[p * 4] = r;
          data[p * 4 + 1] = g;
          data[p * 4 + 2] = b;
          data[p * 4 + 3] = 150;
        }
      }
    });
    setOverlay({ width, height, data });
  }, [out]);

  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img])))}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <ImagePreview src={img}>{overlay && <CanvasImage img={overlay} className="overlay" />}</ImagePreview>
      {out && (
        <div className="row wrap">
          {out.map((s, i) => (
            <span key={i} className="entity" style={{ background: PALETTE[i % PALETTE.length] }}>
              {s.label}
              {s.score != null && <small> {(s.score * 100).toFixed(0)}%</small>}
            </span>
          ))}
        </div>
      )}
    </TjsPanel>
  );
}

export function Depth() {
  const d = useDemo('Depth estimation', 'depth-estimation', [
    { id: 'onnx-community/depth-anything-v2-small', size: '27 MB (q8)', mobile: true },
    { id: 'Xenova/dpt-hybrid-midas', size: '125 MB (q8)' },
    { id: 'onnx-community/DepthPro-ONNX', size: '~1 GB', dtype: 'q4', note: 'Apple DepthPro – metric depth, very heavy.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[2].url);
  const [out, setOut] = useState<SerializedImage | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut((await d.tjs.run([img]))?.depth?.__image ?? null)}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <div className="grid2">
        <ImagePreview src={img} />
        {out && <CanvasImage img={out} />}
      </div>
    </TjsPanel>
  );
}

export function Caption() {
  const d = useDemo('Captioning & OCR', 'image-to-text', [
    { id: 'Xenova/vit-gpt2-image-captioning', size: '250 MB (q8)', mobile: true, note: 'Image captioning (EN).' },
    { id: 'Xenova/trocr-small-printed', size: '60 MB (q8)', mobile: true, note: 'OCR – single line of printed text (crop tightly).' },
    { id: 'Xenova/trocr-small-handwritten', size: '60 MB (q8)', mobile: true, note: 'OCR – single line of handwriting.' },
  ]);
  const [img, setImg] = useImage();
  const [out, setOut] = useState<string | null>(null);
  return (
    <TjsPanel
      {...d.panel}
      onRun={async () => {
        const r = await d.tjs.run([img], { max_new_tokens: 64 }, { stream: true });
        if (r) setOut(flat(r)[0].generated_text);
      }}
      output={(out || d.tjs.streamText) && <Card title="Text"><p className="big">{d.tjs.busy ? d.tjs.streamText : out}</p></Card>}
    >
      <ImageInput value={img} onChange={setImg} />
      <ImagePreview src={img} />
    </TjsPanel>
  );
}

export function BackgroundRemoval() {
  const d = useDemo('Background removal', 'background-removal', [
    { id: 'briaai/RMBG-1.4', size: '44 MB (q8)', mobile: true, note: 'Non-commercial license.' },
    { id: 'Xenova/modnet', size: '6.5 MB', mobile: true, note: 'Portrait matting.' },
    { id: 'onnx-community/BiRefNet_lite-ONNX', size: '~220 MB', dtype: 'fp16', note: 'High quality, WebGPU recommended.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[4].url);
  const [out, setOut] = useState<SerializedImage | null>(null);
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img]))[0]?.__image ?? null)}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <div className="grid2">
        <ImagePreview src={img} />
        {out && <CanvasImage img={out} className="result-img checker" />}
      </div>
    </TjsPanel>
  );
}

export function SuperRes() {
  const d = useDemo('Super-resolution', 'image-to-image', [
    { id: 'Xenova/swin2SR-classical-sr-x2-64', size: '4 MB', mobile: true, note: '2× upscale. Keep inputs small (< 512 px) – cost grows fast.' },
    { id: 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr', size: '17 MB', note: '4× upscale for real-world photos.' },
    { id: 'Xenova/swin2SR-compressed-sr-x4-48', size: '5 MB', note: '4× upscale, JPEG artifact removal.' },
  ]);
  const [img, setImg] = useImage(SAMPLE_IMAGES[4].url);
  const [out, setOut] = useState<SerializedImage | null>(null);
  const [inSize, setInSize] = useState('');
  return (
    <TjsPanel {...d.panel} onRun={async () => setOut(flat(await d.tjs.run([img]))[0]?.__image ?? null)}>
      <ImageInput value={img} onChange={(u) => (setImg(u), setOut(null))} />
      <div className="grid2">
        <div>
          <ImagePreview src={img} />
          <p className="hint">{inSize}</p>
        </div>
        {out && (
          <div>
            <CanvasImage img={out} />
            <p className="hint">{out.width}×{out.height}</p>
          </div>
        )}
      </div>
      <img hidden src={img} crossOrigin="anonymous" onLoad={(e) => setInSize(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} alt="" />
    </TjsPanel>
  );
}
