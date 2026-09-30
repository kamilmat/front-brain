/**
 * Tracks when each loaded model is actually computing (inference spans), so apps can show
 * live per-model load: busy %, calls per second and latency.
 */

export interface ActivityStats {
  key: string;
  /** Share of the window spent computing, 0..1. */
  busy: number;
  calls: number;
  callsPerSec: number;
  avgMs: number;
  lastMs: number;
  running: boolean;
}

interface Span {
  start: number;
  end: number;
}

const KEEP_MS = 60_000;

export class ActivityTracker {
  private spans = new Map<string, Span[]>();
  private inflight = new Map<string, Set<number>>();

  /** Mark the start of work; call the returned function when it ends. */
  begin(key: string): () => void {
    const start = performance.now();
    const set = this.inflight.get(key) ?? new Set<number>();
    this.inflight.set(key, set.add(start));
    let done = false;
    return () => {
      if (done) return;
      done = true;
      set.delete(start);
      this.record(key, start, performance.now());
    };
  }

  /** Record a finished span (e.g. measured synchronously). */
  record(key: string, start: number, end: number) {
    const arr = this.spans.get(key) ?? [];
    arr.push({ start, end });
    const cutoff = end - KEEP_MS;
    while (arr.length && arr[0].end < cutoff) arr.shift();
    this.spans.set(key, arr);
  }

  forget(key: string) {
    this.spans.delete(key);
    this.inflight.delete(key);
  }

  /** Stats per key over the last `windowMs`. */
  stats(windowMs = 3000): ActivityStats[] {
    const now = performance.now();
    const from = now - windowMs;
    const keys = new Set([...this.spans.keys(), ...this.inflight.keys()]);
    const out: ActivityStats[] = [];
    for (const key of keys) {
      const spans = [...(this.spans.get(key) ?? []), ...[...(this.inflight.get(key) ?? [])].map((s) => ({ start: s, end: now }))]
        .filter((s) => s.end > from)
        .sort((a, b) => a.start - b.start);
      // Union of overlapping spans clipped to the window. (Times can be small or negative right after
      // page load – performance.now() starts at 0 – so no numeric sentinels.)
      let busyMs = 0;
      let cur: { s: number; e: number } | null = null;
      for (const sp of spans) {
        const a = Math.max(sp.start, from);
        if (!cur || a > cur.e) {
          if (cur) busyMs += cur.e - cur.s;
          cur = { s: a, e: sp.end };
        } else cur.e = Math.max(cur.e, sp.end);
      }
      if (cur) busyMs += cur.e - cur.s;
      const finished = (this.spans.get(key) ?? []).filter((s) => s.end > from);
      const all = this.spans.get(key) ?? [];
      out.push({
        key,
        busy: Math.min(1, busyMs / windowMs),
        calls: finished.length,
        callsPerSec: finished.length / (windowMs / 1000),
        avgMs: finished.length ? finished.reduce((n, s) => n + s.end - s.start, 0) / finished.length : 0,
        lastMs: all.length ? all[all.length - 1].end - all[all.length - 1].start : 0,
        running: (this.inflight.get(key)?.size ?? 0) > 0,
      });
    }
    return out;
  }
}

/** Shared tracker used by all @front-brain runtimes. */
export const activity = new ActivityTracker();
