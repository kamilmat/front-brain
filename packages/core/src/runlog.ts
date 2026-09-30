/** Framework-agnostic run log persisted in localStorage. */
export interface RunRecord {
  ts: number;
  demo: string;
  /** Runtime / library, e.g. "transformers", "webllm". */
  lib: string;
  model: string;
  device?: string;
  dtype?: string;
  loadMs?: number;
  inferMs?: number;
  note?: string;
}

const KEY = 'fb:runlog';
const MAX = 500;
const listeners = new Set<() => void>();
let records: RunRecord[] = read();

function read(): RunRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage full / blocked – keep in memory */
  }
  listeners.forEach((l) => l());
}

export function logRun(r: Omit<RunRecord, 'ts'>) {
  records = [{ ts: Date.now(), ...r }, ...records].slice(0, MAX);
  persist();
}

export function clearRuns() {
  records = [];
  persist();
}

export const getRuns = () => records;

export function subscribeRuns(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
