export interface EnvInfo {
  userAgent: string;
  mobile: boolean;
  cores: number;
  deviceMemoryGB?: number;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  wasmSimd: boolean;
  webgpu: boolean;
  gpu?: { vendor?: string; architecture?: string; description?: string; f16: boolean; maxBufferMB: number; maxStorageBufferMB: number };
  webnn: boolean;
  storage?: { usageMB: number; quotaMB: number };
  chromeAI: Record<string, string>;
}

const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export const CHROME_AI_APIS = ['LanguageModel', 'Summarizer', 'Translator', 'LanguageDetector', 'Writer', 'Rewriter', 'Proofreader'] as const;

let gpuPromise: Promise<boolean> | null = null;
/** Cached WebGPU check – `navigator.gpu` may exist without a usable adapter. */
export function hasWebGPU(): Promise<boolean> {
  gpuPromise ??= (async () => {
    try {
      return !!(await (navigator as any).gpu?.requestAdapter());
    } catch {
      return false;
    }
  })();
  return gpuPromise;
}

export async function detectEnv(): Promise<EnvInfo> {
  const nav = navigator as any;
  const info: EnvInfo = {
    userAgent: navigator.userAgent,
    mobile: nav.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    cores: navigator.hardwareConcurrency ?? 0,
    deviceMemoryGB: nav.deviceMemory,
    crossOriginIsolated: self.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    wasmSimd: WebAssembly.validate(SIMD_PROBE),
    webgpu: false,
    webnn: 'ml' in navigator,
    chromeAI: {},
  };

  try {
    const adapter = await nav.gpu?.requestAdapter();
    if (adapter) {
      const ai = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
      info.webgpu = true;
      info.gpu = {
        vendor: ai.vendor,
        architecture: ai.architecture,
        description: ai.description,
        f16: adapter.features.has('shader-f16'),
        maxBufferMB: Math.round(adapter.limits.maxBufferSize / 2 ** 20),
        maxStorageBufferMB: Math.round(adapter.limits.maxStorageBufferBindingSize / 2 ** 20),
      };
    }
  } catch {
    /* no WebGPU */
  }

  try {
    const est = await navigator.storage?.estimate();
    if (est) info.storage = { usageMB: Math.round((est.usage ?? 0) / 2 ** 20), quotaMB: Math.round((est.quota ?? 0) / 2 ** 20) };
  } catch {
    /* ignore */
  }

  for (const name of CHROME_AI_APIS) {
    const api = (self as any)[name];
    if (!api) {
      info.chromeAI[name] = 'not present';
      continue;
    }
    try {
      info.chromeAI[name] = name === 'Translator'
        ? await api.availability({ sourceLanguage: 'en', targetLanguage: 'pl' })
        : await api.availability();
    } catch (e) {
      info.chromeAI[name] = 'error: ' + (e as Error).message;
    }
  }
  return info;
}
