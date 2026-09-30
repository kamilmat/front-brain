import type { SerializedImage } from './protocol';

/** Draw a serialized RGBA image (from pipeline output `{ __image }`) onto a canvas. */
export function drawImage(img: SerializedImage, canvas: HTMLCanvasElement | OffscreenCanvas) {
  canvas.width = img.width;
  canvas.height = img.height;
  (canvas.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}

/** Flatten nested pipeline outputs ([[...]] → [...]). */
export const flatten = <T = any>(r: unknown): T[] => [r].flat(2) as T[];
