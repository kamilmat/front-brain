import type { HardwareProfile } from './hardware.js';

export interface ModelRequirements {
  /** Download size of weights in MB. */
  sizeMB?: number;
  /** Known runtime memory (e.g. WebLLM vram_required_MB). */
  memoryMB?: number;
  needsWebGPU?: boolean;
  /** Needs WebGPU shader-f16 (fp16 / q4f16 weights on GPU). */
  needsF16?: boolean;
  /** Real-time use case (video) – penalise CPU-only. */
  realtime?: boolean;
}

export type Fit = 'great' | 'ok' | 'heavy' | 'risky' | 'unsupported' | 'unknown';

export interface FitAssessment {
  fit: Fit;
  /** One-line human summary. */
  label: string;
  reasons: string[];
  suggestedDevice: 'webgpu' | 'wasm';
}

export const FIT_ICON: Record<Fit, string> = { great: '✅', ok: '🟢', heavy: '⚠️', risky: '🟥', unsupported: '⛔', unknown: '❔' };

/**
 * Advisory only – never blocks. Estimates whether a model will run comfortably on this device.
 * Heuristics: weights × 1.5 ≈ working memory; budget derived from device memory, WebGPU and form factor.
 */
export function assessFit(req: ModelRequirements, hw: HardwareProfile, device?: 'webgpu' | 'wasm', dtype?: string): FitAssessment {
  const reasons: string[] = [];
  const dev = device ?? (hw.webgpu ? 'webgpu' : 'wasm');
  // Tiny models are often as fast on CPU (no GPU upload/compile cost).
  const suggestedDevice = hw.webgpu && (req.needsWebGPU || req.realtime || (req.sizeMB ?? 100) > 30) ? 'webgpu' : 'wasm';

  if ((req.needsWebGPU || dev === 'webgpu') && !hw.webgpu) {
    return { fit: 'unsupported', label: 'WebGPU not available', reasons: ['This browser/device has no usable WebGPU adapter. Try WASM or Chrome/Edge/Safari 26+.'], suggestedDevice: 'wasm' };
  }
  const f16Needed = req.needsF16 || (dev === 'webgpu' && !!dtype && /f16/.test(dtype));
  if (dev === 'wasm' && dtype && /f16/.test(dtype)) reasons.push('fp16 weights on CPU (WASM) are slow or unsupported – prefer q8 / q4 / fp32.');
  if (f16Needed && hw.webgpu && !hw.f16) reasons.push('GPU lacks shader-f16 – fp16/q4f16 weights may fail; pick q4 or fp32.');

  const need = req.memoryMB ?? (req.sizeMB != null ? req.sizeMB * 1.5 : undefined);
  if (need == null) {
    return { fit: 'unknown', label: 'Unknown size', reasons: [...reasons, 'No size info – try it and watch the memory.'], suggestedDevice };
  }
  const budget = hw.budgetMB;
  let fit: Fit;
  if (need > budget * 2) {
    fit = 'risky';
    reasons.unshift(`Needs ~${fmt(need)} vs ~${fmt(budget)} safe budget – the tab may crash or run out of memory.`);
  } else if (need > budget) {
    fit = 'heavy';
    reasons.unshift(`Needs ~${fmt(need)}, above the ~${fmt(budget)} comfort budget – may be slow or unstable.`);
  } else if (dev === 'wasm' && (req.sizeMB ?? 0) > 400) {
    fit = 'heavy';
    reasons.unshift('Large model on CPU (WASM) – expect slow inference; WebGPU recommended.');
  } else if (req.realtime && dev === 'wasm' && hw.tier === 'low') {
    fit = 'heavy';
    reasons.unshift('Real-time on a low-end CPU – expect low FPS.');
  } else {
    fit = need < budget * 0.3 ? 'great' : 'ok';
  }
  if (f16Needed && hw.webgpu && !hw.f16 && fit !== 'risky') fit = 'heavy';
  if (hw.mobile && (req.sizeMB ?? 0) > 150) reasons.push(`Download of ${fmt(req.sizeMB!)} on mobile data.`);
  const label = { great: 'Great fit', ok: 'Should run fine', heavy: 'Heavy for this device', risky: 'Probably too big', unsupported: 'Unsupported', unknown: 'Unknown' }[fit];
  return { fit, label, reasons, suggestedDevice };
}

const fmt = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
export const formatMB = fmt;
export const formatBytes = (b: number) => fmt(b / 2 ** 20);
