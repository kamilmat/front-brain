import { useCallback, useEffect, useState } from 'react';
import { runTjs, type Device, type FileProgress, type RunStats } from '../core/transformers/client';
import { hasWebGPU } from '../core/env';
import { logRun } from '../core/runlog';

export interface ModelPreset {
  id: string;
  size?: string;
  /** Reasonable to run on a mid-range phone. */
  mobile?: boolean;
  dtype?: string;
  note?: string;
}

export interface ModelChoice {
  model: string;
  device: Device;
  dtype: string;
}

export function useModelChoice(presets: ModelPreset[]) {
  const [choice, setChoice] = useState<ModelChoice>({ model: presets[0].id, device: 'wasm', dtype: presets[0].dtype ?? '' });
  const [gpu, setGpu] = useState(false);
  useEffect(() => {
    hasWebGPU().then((ok) => {
      setGpu(ok);
      if (ok) setChoice((c) => ({ ...c, device: 'webgpu' }));
    });
  }, []);
  return { choice, setChoice, gpu };
}

export function useTjs(demo: string, task: string, choice: ModelChoice) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Record<string, FileProgress>>({});
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');

  const run = useCallback(
    async <T = any>(args: unknown[], options?: Record<string, unknown>, opts: { stream?: boolean; quiet?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      setStreamText('');
      if (!opts.quiet) setStats(null);
      try {
        const { result, stats } = await runTjs<T>(
          { task, model: choice.model, device: choice.device, dtype: choice.dtype || undefined, args, options, stream: opts.stream },
          {
            onProgress: (p) => {
              if (p.status === 'progress' || p.status === 'done' || p.status === 'initiate') {
                setFiles((f) => ({
                  ...f,
                  [p.file]: {
                    file: p.file,
                    loaded: p.loaded ?? f[p.file]?.loaded ?? 0,
                    total: p.total ?? f[p.file]?.total ?? 0,
                    status: p.status,
                  },
                }));
              }
            },
            onToken: (t) => setStreamText((s) => s + t),
          },
        );
        setStats(stats);
        if (!opts.quiet) {
          logRun({ demo, lib: 'transformers.js', model: choice.model, device: choice.device, dtype: choice.dtype || 'auto', loadMs: stats.loadMs, inferMs: stats.inferMs, note: stats.tokens ? `${stats.tokens} tok` : undefined });
        }
        return result;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      } finally {
        setBusy(false);
        setFiles((f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v.status !== 'done')));
      }
    },
    [demo, task, choice.model, choice.device, choice.dtype],
  );

  return { run, busy, files, stats, error, streamText };
}
