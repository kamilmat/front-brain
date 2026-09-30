import { registry as defaultRegistry, type ModelRegistry } from '@front-brain/core';

/** Chrome built-in AI APIs (Gemini Nano on-device). All are optional globals. */
export const CHROME_AI_APIS = ['LanguageModel', 'Summarizer', 'Translator', 'LanguageDetector', 'Writer', 'Rewriter', 'Proofreader'] as const;
export type ChromeAIApi = (typeof CHROME_AI_APIS)[number];
export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available' | 'not present' | 'error';

const api = (name: ChromeAIApi): any => (globalThis as any)[name];

export const isPresent = (name: ChromeAIApi) => !!api(name);

export async function availability(name: ChromeAIApi, options?: Record<string, unknown>): Promise<Availability> {
  const A = api(name);
  if (!A) return 'not present';
  try {
    return await A.availability(options ?? (name === 'Translator' ? { sourceLanguage: 'en', targetLanguage: 'es' } : undefined));
  } catch {
    return 'error';
  }
}

export async function availabilityAll(): Promise<Record<ChromeAIApi, Availability>> {
  const out = {} as Record<ChromeAIApi, Availability>;
  await Promise.all(CHROME_AI_APIS.map(async (n) => (out[n] = await availability(n))));
  return out;
}

/**
 * Create a session for one of the APIs. Triggers the Gemini Nano download if needed
 * (`onDownloadProgress` gets 0..1). Sessions are tracked in the model registry; unloading destroys them.
 */
export async function createSession<T = any>(name: ChromeAIApi, options: Record<string, unknown> = {}, onDownloadProgress?: (fraction: number) => void, reg: ModelRegistry = defaultRegistry): Promise<T> {
  const A = api(name);
  if (!A) throw new Error(`${name} API is not available in this browser.`);
  const key = `chrome-ai:${name}:${JSON.stringify(options)}`;
  reg.upsert({ key, runtime: 'chrome-ai', model: 'Gemini Nano', task: name, device: 'on-device', status: 'loading' });
  try {
    const t0 = performance.now();
    const session = await A.create({
      ...options,
      monitor(m: EventTarget) {
        m.addEventListener('downloadprogress', (e: any) => {
          reg.patch(key, { progress: e.loaded });
          onDownloadProgress?.(e.loaded);
        });
      },
    });
    reg.upsert({ key, runtime: 'chrome-ai', model: 'Gemini Nano', task: name, device: 'on-device', status: 'ready', loadMs: performance.now() - t0, loadedAt: Date.now() }, () => session.destroy?.());
    return session;
  } catch (e) {
    reg.remove(key);
    throw e;
  }
}

/** Stream a prompt through a LanguageModel session, calling onChunk with the growing text. */
export async function promptStreaming(session: any, input: string, onChunk: (full: string) => void): Promise<string> {
  let acc = '';
  for await (const chunk of session.promptStreaming(input)) {
    acc += chunk;
    onChunk(acc);
  }
  return acc;
}
