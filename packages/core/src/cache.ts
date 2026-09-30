/** Inspect and delete downloaded model files in Cache Storage (used by Transformers.js, WebLLM and others). */
export interface CachedModel {
  /** Model id when recognisable (org/name), otherwise the host. */
  id: string;
  cache: string;
  files: number;
  bytes: number;
  urls: string[];
}

function modelIdFromUrl(url: string): string {
  const u = new URL(url);
  // https://huggingface.co/{org}/{name}/resolve/... or /api/resolve-cache/models/{org}/{name}/...
  const m = u.pathname.match(/^\/(?:api\/resolve-cache\/models\/)?([^/]+)\/([^/]+)\/(?:resolve|raw)\//);
  if (m) return `${m[1]}/${m[2]}`;
  // WebLLM model libs: .../web-llm-models/.../<Model>-webgpu.wasm
  const lib = u.pathname.match(/\/([^/]+)-webgpu\.wasm$/);
  if (lib) return lib[1];
  return u.host;
}

export async function listCachedModels(): Promise<CachedModel[]> {
  if (!('caches' in self)) return [];
  const byId = new Map<string, CachedModel>();
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const id = modelIdFromUrl(req.url);
      const key = `${name}|${id}`;
      const entry = byId.get(key) ?? { id, cache: name, files: 0, bytes: 0, urls: [] };
      const res = await cache.match(req);
      const len = Number(res?.headers.get('content-length') ?? 0) || (res ? (await res.clone().blob()).size : 0);
      entry.files++;
      entry.bytes += len;
      entry.urls.push(req.url);
      byId.set(key, entry);
    }
  }
  return [...byId.values()].sort((a, b) => b.bytes - a.bytes);
}

export async function deleteCachedModel(m: CachedModel) {
  const cache = await caches.open(m.cache);
  await Promise.all(m.urls.map((u) => cache.delete(u)));
}

export async function clearAllCaches(): Promise<string[]> {
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
  return names;
}

/** Fetch with byte progress, persisted in Cache Storage. */
export async function fetchCached(url: string, onProgress?: (fraction: number, loaded: number, total: number) => void, cacheName = 'front-brain'): Promise<Uint8Array> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(url);
  if (hit) {
    const buf = new Uint8Array(await hit.arrayBuffer());
    onProgress?.(1, buf.length, buf.length);
    return buf;
  }
  const net = await fetch(url);
  if (!net.ok) throw new Error(`Download failed: ${net.status} ${url}`);
  const total = +(net.headers.get('content-length') ?? 0);
  const reader = net.body!.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress?.(total ? loaded / total : 0, loaded, total);
  }
  const blob = new Blob(parts as BlobPart[]);
  await cache.put(url, new Response(blob, { headers: { 'content-length': String(blob.size) } })).catch(() => {});
  return new Uint8Array(await blob.arrayBuffer());
}
