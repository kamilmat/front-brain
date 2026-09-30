import { useCallback, useRef, useState } from 'react';
import { logRun } from '@front-brain/core';
import { getTransformersRuntime, specKey, type PipelineSpec, type RunStats, type TransformersRuntime } from '@front-brain/transformers';
import { useLoadedModel } from './hooks.js';

export interface FileProgress {
  file: string;
  loaded: number;
  total: number;
  status: string;
}

/**
 * Explicit load / unload / run of a Transformers.js pipeline with progress, streaming and stats.
 * `run` auto-loads if needed. Pass `label` to record runs in the run log.
 */
export function usePipeline(spec: PipelineSpec, opts: { label?: string; runtime?: TransformersRuntime } = {}) {
  const rt = opts.runtime ?? getTransformersRuntime();
  const key = specKey(spec);
  const entry = useLoadedModel(key);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Record<string, FileProgress>>({});
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  /** Id of the latest run – older overlapping runs must not overwrite its state. */
  const lastRun = useRef(0);

  const onProgress = useCallback((p: any) => {
    if (!p.file || !['initiate', 'download', 'progress', 'done'].includes(p.status)) return;
    setFiles((f) => {
      if (p.status === 'done') {
        const { [p.file]: _, ...rest } = f;
        return rest;
      }
      return { ...f, [p.file]: { file: p.file, loaded: p.loaded ?? f[p.file]?.loaded ?? 0, total: p.total ?? f[p.file]?.total ?? 0, status: p.status } };
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      await rt.load(spec, { onProgress });
      const loaded = rt.entry(spec);
      if (opts.label) logRun({ demo: opts.label, lib: 'transformers', model: spec.model, device: spec.device, dtype: spec.dtype ?? 'auto', loadMs: loaded?.loadMs, note: 'load' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFiles({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rt, onProgress, opts.label]);

  const unload = useCallback(() => rt.unload(spec), [key, rt]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(
    async <T = any>(args: unknown[], options?: Record<string, unknown>, o: { stream?: boolean; quiet?: boolean } = {}): Promise<T | undefined> => {
      const runId = ++lastRun.current;
      const latest = () => runId === lastRun.current;
      setBusy(true);
      setError(null);
      setStreamText('');
      try {
        const { result, stats } = await rt.run<T>(spec, args, options, { stream: o.stream, onProgress, onToken: (t) => latest() && setStreamText((s) => s + t) });
        if (latest()) setStats(stats);
        if (opts.label && !o.quiet) {
          logRun({ demo: opts.label, lib: 'transformers', model: spec.model, device: spec.device, dtype: spec.dtype ?? 'auto', loadMs: stats.loadMs || undefined, inferMs: stats.inferMs, note: stats.tokens ? `${stats.tokens} tok` : undefined });
        }
        return result;
      } catch (err) {
        if (latest()) setError((err as Error).message);
        return undefined;
      } finally {
        if (latest()) {
          setBusy(false);
          setFiles({});
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, rt, onProgress, opts.label],
  );

  return {
    key,
    /** Registry entry (status, bytes, progress) – undefined when not loaded. */
    entry,
    loaded: entry?.status === 'ready',
    loading: entry?.status === 'loading',
    busy,
    files,
    stats,
    error,
    streamText,
    load,
    unload,
    run,
  };
}
