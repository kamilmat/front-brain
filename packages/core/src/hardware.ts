import { hasWebGPU } from './env';

export type Tier = 'low' | 'mid' | 'high';

export interface HardwareProfile {
  webgpu: boolean;
  /** WebGPU `shader-f16` – needed for fp16 / q4f16 weights on GPU. */
  f16: boolean;
  /** Largest single GPU buffer (MB). */
  maxBufferMB: number;
  /** navigator.deviceMemory (Chromium only, capped); null when unknown. */
  memoryGB: number | null;
  cores: number;
  mobile: boolean;
  gpuName?: string;
  tier: Tier;
  /** Rough memory budget we consider safe for model weights (MB). */
  budgetMB: number;
}

let cached: Promise<HardwareProfile> | null = null;

export function getHardwareProfile(): Promise<HardwareProfile> {
  cached ??= (async () => {
    const nav = navigator as any;
    const mobile: boolean = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const memoryGB: number | null = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
    const cores = navigator.hardwareConcurrency ?? 4;
    let f16 = false;
    let maxBufferMB = 0;
    let gpuName: string | undefined;
    const webgpu = await hasWebGPU();
    if (webgpu) {
      try {
        const adapter = await nav.gpu.requestAdapter();
        f16 = adapter.features.has('shader-f16');
        maxBufferMB = Math.round(adapter.limits.maxBufferSize / 2 ** 20);
        const info = adapter.info ?? {};
        gpuName = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || undefined;
      } catch {
        /* ignore */
      }
    }
    const mem = memoryGB ?? (mobile ? 4 : 8);
    const tier: Tier = webgpu && !mobile && mem >= 8 ? 'high' : webgpu || (!mobile && cores >= 8) ? 'mid' : 'low';
    const budgetMB = Math.round(mobile ? Math.min(mem * 1024 * 0.25, 1500) : webgpu ? Math.min(mem * 1024 * 0.5, 6144) : Math.min(mem * 1024 * 0.35, 3072));
    return { webgpu, f16, maxBufferMB, memoryGB, cores, mobile, gpuName, tier, budgetMB };
  })();
  return cached;
}
