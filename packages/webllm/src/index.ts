import type { ChatCompletionMessageParam, MLCEngineInterface } from '@mlc-ai/web-llm';
import { registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';

export interface WebLLMModelInfo {
  id: string;
  /** VRAM needed (MB) per MLC metadata. */
  vramMB: number;
  lowResource: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  prefillTps?: number;
  decodeTps?: number;
  totalMs: number;
}

export interface WebLLMOptions {
  createWorker?: () => Worker;
  registry?: ModelRegistry;
}

/** All prebuilt chat models known to the installed @mlc-ai/web-llm, sorted by VRAM. */
export async function listWebLLMModels(): Promise<WebLLMModelInfo[]> {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  return prebuiltAppConfig.model_list
    .filter((m) => !/embed/i.test(m.model_id) && m.model_type !== 1 /* embedding */)
    .map((m) => ({ id: m.model_id, vramMB: Math.round(m.vram_required_MB ?? 0), lowResource: !!m.low_resource_required }))
    .sort((a, b) => a.vramMB - b.vramMB);
}

/** One WebLLM engine (one model at a time) running in a Web Worker. */
export class WebLLMRuntime {
  private engine: MLCEngineInterface | null = null;
  private registry: ModelRegistry;
  private createWorker: () => Worker;
  model: string | null = null;

  constructor(opts: WebLLMOptions = {}) {
    this.registry = opts.registry ?? defaultRegistry;
    this.createWorker = opts.createWorker ?? (() => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }));
  }

  private key(model: string) {
    return `webllm:${model}`;
  }

  async load(model: string, onProgress?: (p: { progress: number; text: string }) => void, vramMB?: number) {
    const webllm = await import('@mlc-ai/web-llm');
    if (this.model && this.model !== model) this.registry.remove(this.key(this.model));
    const key = this.key(model);
    this.registry.upsert({ key, runtime: 'webllm', model, task: 'chat', device: 'webgpu', status: 'loading', progress: 0 }, () => this.unload());
    const initProgressCallback = (p: { progress: number; text: string }) => {
      this.registry.patch(key, { progress: p.progress });
      onProgress?.(p);
    };
    const t0 = performance.now();
    try {
      if (!this.engine) {
        this.engine = await webllm.CreateWebWorkerMLCEngine(this.createWorker(), model, { initProgressCallback });
      } else {
        this.engine.setInitProgressCallback(initProgressCallback);
        await this.engine.reload(model);
      }
    } catch (e) {
      this.registry.remove(key);
      throw e;
    }
    this.model = model;
    const loadMs = performance.now() - t0;
    this.registry.patch(key, { status: 'ready', progress: 1, loadMs, loadedAt: Date.now(), bytes: vramMB ? vramMB * 2 ** 20 : undefined });
    return { loadMs };
  }

  async chat(messages: ChatMessage[], opts: { onToken?: (delta: string, full: string) => void; temperature?: number; maxTokens?: number } = {}): Promise<ChatResult> {
    if (!this.engine || !this.model) throw new Error('No model loaded');
    const t0 = performance.now();
    const chunks = await this.engine.chat.completions.create({
      messages: messages as ChatCompletionMessageParam[],
      stream: true,
      stream_options: { include_usage: true },
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    });
    let text = '';
    const res: ChatResult = { text: '', totalMs: 0 };
    for await (const c of chunks) {
      const d = c.choices[0]?.delta?.content ?? '';
      if (d) {
        text += d;
        opts.onToken?.(d, text);
      }
      if (c.usage) {
        const x = (c.usage as any).extra ?? {};
        Object.assign(res, { promptTokens: c.usage.prompt_tokens, completionTokens: c.usage.completion_tokens, prefillTps: x.prefill_tokens_per_s, decodeTps: x.decode_tokens_per_s });
      }
    }
    this.registry.patch(this.key(this.model), { lastUsedAt: Date.now() });
    return { ...res, text, totalMs: performance.now() - t0 };
  }

  interrupt() {
    this.engine?.interruptGenerate();
  }

  async resetChat() {
    await this.engine?.resetChat();
  }

  async unload() {
    if (this.model) this.registry.remove(this.key(this.model));
    this.model = null;
    await this.engine?.unload();
  }
}

let shared: WebLLMRuntime | null = null;
export const getWebLLMRuntime = (opts?: WebLLMOptions) => (shared ??= new WebLLMRuntime(opts));
