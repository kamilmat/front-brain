import { useSyncExternalStore } from 'react';
import { getRuns, subscribeRuns } from '../core/runlog';

export const useRuns = () => useSyncExternalStore(subscribeRuns, getRuns);
