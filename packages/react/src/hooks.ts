import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  assessFit,
  deleteCachedModel,
  getHardwareProfile,
  getRuns,
  listCachedModels,
  registry as defaultRegistry,
  subscribeRuns,
  type CachedModel,
  type FitAssessment,
  type HardwareProfile,
  type ModelRegistry,
  type ModelRequirements,
} from '@front-brain/core';

/** All models currently loaded in memory (any runtime). */
export function useLoadedModels(reg: ModelRegistry = defaultRegistry) {
  return useSyncExternalStore(reg.subscribe, reg.list);
}

export function useLoadedModel(key: string | undefined, reg: ModelRegistry = defaultRegistry) {
  return useLoadedModels(reg).find((m) => m.key === key);
}

export function useHardware(): HardwareProfile | null {
  const [hw, setHw] = useState<HardwareProfile | null>(null);
  useEffect(() => {
    getHardwareProfile().then(setHw);
  }, []);
  return hw;
}

/** Advisory fit of a model on this device (null until hardware is detected). */
export function useFit(req: ModelRequirements | null, device?: 'webgpu' | 'wasm', dtype?: string): FitAssessment | null {
  const hw = useHardware();
  return hw && req ? assessFit(req, hw, device, dtype) : null;
}

export function useRuns() {
  return useSyncExternalStore(subscribeRuns, getRuns);
}

/** Models downloaded to Cache Storage, with refresh/delete. */
export function useCachedModels() {
  const [models, setModels] = useState<CachedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setModels(await listCachedModels());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const remove = useCallback(
    async (m: CachedModel) => {
      await deleteCachedModel(m);
      await refresh();
    },
    [refresh],
  );
  return { models, loading, refresh, remove };
}
