import { activity, type ActivityStats } from './activity.js';
import { registry } from './registry.js';

export type CpuPressure = 'nominal' | 'fair' | 'serious' | 'critical';

export interface PerfSample {
  t: number;
  /** Main-thread animation frames per second. */
  fps: number;
  /** Worst event-loop delay in the interval (ms) – how late timers fired. */
  lagMs: number;
  /** Time spent in long tasks (>50 ms) during the interval (ms). Chromium only. */
  longTaskMs: number | null;
  /** Main-thread JS heap in MB (Chromium, non-standard). Workers are not included. */
  heapMB: number | null;
  /** System CPU pressure from the Compute Pressure API (Chromium 125+). */
  cpu: CpuPressure | null;
  /** Estimated memory held by loaded model weights (MB). */
  modelsMB: number;
  /** Per-model activity over the last interval window. */
  models: ActivityStats[];
}

export const perfSupport = () => ({
  longTasks: typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask'),
  heap: !!(performance as any).memory,
  cpuPressure: 'PressureObserver' in globalThis,
});

/**
 * Samples main-thread health + per-model activity every `intervalMs`.
 * Browsers don't expose per-process CPU/GPU usage – these are the honest proxies.
 */
export function startPerfMonitor(onSample: (s: PerfSample) => void, intervalMs = 1000): () => void {
  let frames = 0;
  let raf = 0;
  const countFrame = () => {
    frames++;
    raf = requestAnimationFrame(countFrame);
  };
  raf = requestAnimationFrame(countFrame);

  // Event-loop lag: a 50 ms heartbeat measures how late it fires.
  let maxLag = 0;
  let expected = performance.now() + 50;
  const beat = setInterval(() => {
    const now = performance.now();
    maxLag = Math.max(maxLag, now - expected);
    expected = now + 50;
  }, 50);

  let longTask = 0;
  let lto: PerformanceObserver | null = null;
  if (perfSupport().longTasks) {
    lto = new PerformanceObserver((list) => list.getEntries().forEach((e) => (longTask += e.duration)));
    lto.observe({ type: 'longtask', buffered: false } as PerformanceObserverInit);
  }

  let cpu: CpuPressure | null = null;
  let pressure: any = null;
  if (perfSupport().cpuPressure) {
    try {
      pressure = new (globalThis as any).PressureObserver((records: any[]) => (cpu = records[records.length - 1]?.state ?? cpu));
      pressure.observe('cpu', { sampleInterval: 1000 }).catch(() => (pressure = null));
    } catch {
      pressure = null;
    }
  }

  let last = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    const mem = (performance as any).memory;
    onSample({
      t: Date.now(),
      fps: Math.round(frames / dt),
      lagMs: Math.max(0, Math.round(maxLag)),
      longTaskMs: lto ? Math.round(longTask) : null,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 2 ** 20) : null,
      cpu,
      modelsMB: Math.round(registry.totalBytes() / 2 ** 20),
      models: activity.stats(Math.max(intervalMs, 2000)),
    });
    frames = 0;
    maxLag = 0;
    longTask = 0;
  }, intervalMs);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(beat);
    clearInterval(tick);
    lto?.disconnect();
    pressure?.disconnect?.();
  };
}
