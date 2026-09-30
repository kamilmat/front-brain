import { useSyncExternalStore } from 'react';
import { createStore, startPerfMonitor, type PerfSample } from '@front-brain/core';

const HISTORY = 60;
const store = createStore<PerfSample[]>([]);
let stop: (() => void) | null = null;

export function setPerfMonitoring(on: boolean) {
  if (on && !stop) stop = startPerfMonitor((s) => store.set([...store.get(), s].slice(-HISTORY)), 1000);
  if (!on && stop) {
    stop();
    stop = null;
  }
}

export const usePerfHistory = () => useSyncExternalStore(store.subscribe, store.get);
