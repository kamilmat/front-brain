/**
 * Mood and blink analysis from MediaPipe FaceLandmarker blendshapes (outputFaceBlendshapes: true).
 * Heuristic, not a trained emotion classifier – but real-time and fully on-device.
 */

export type Mood = 'happy' | 'surprised' | 'sad' | 'angry' | 'neutral';
export const MOODS: Mood[] = ['happy', 'surprised', 'sad', 'angry', 'neutral'];
export const MOOD_EMOJI: Record<Mood, string> = { happy: '😄', surprised: '😮', sad: '😢', angry: '😠', neutral: '😐' };

type Cat = { categoryName: string; score: number };
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Blendshape categories as a name → score map. */
export function blendshapeMap(categories: Cat[] | undefined): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of categories ?? []) m[c.categoryName] = c.score;
  return m;
}

/** Instant (unsmoothed) mood scores 0..1 from blendshapes. */
export function moodScores(b: Record<string, number>): Record<Mood, number> {
  const avg = (a: string, c: string) => ((b[a] ?? 0) + (b[c] ?? 0)) / 2;
  const smile = avg('mouthSmileLeft', 'mouthSmileRight');
  const frown = avg('mouthFrownLeft', 'mouthFrownRight');
  const browDown = avg('browDownLeft', 'browDownRight');
  const browInnerUp = b.browInnerUp ?? 0;
  const eyeWide = avg('eyeWideLeft', 'eyeWideRight');
  const sneer = avg('noseSneerLeft', 'noseSneerRight');
  const jawOpen = b.jawOpen ?? 0;
  const pucker = b.mouthPucker ?? 0;
  const happy = clamp(smile * 1.2);
  const surprised = clamp((jawOpen * 0.7 + browInnerUp * 0.5 + eyeWide * 0.6) * (1 - smile));
  const sad = clamp((frown * 1.4 + browInnerUp * 0.6 + pucker * 0.2) * (1 - smile) - jawOpen * 0.3);
  const angry = clamp((browDown * 1.1 + sneer * 0.8) * (1 - smile) - browInnerUp * 0.3);
  const neutral = clamp(1 - Math.max(happy, surprised, sad, angry) * 1.6);
  return { happy, surprised, sad, angry, neutral };
}

/** Smooths mood scores over time (EMA) and reports the dominant mood. */
export class MoodTracker {
  private scores: Record<Mood, number> = { happy: 0, surprised: 0, sad: 0, angry: 0, neutral: 1 };
  constructor(private smoothing = 0.25) {}

  update(categories: Cat[] | undefined): { mood: Mood; scores: Record<Mood, number> } {
    const inst = moodScores(blendshapeMap(categories));
    for (const m of MOODS) this.scores[m] += (inst[m] - this.scores[m]) * this.smoothing;
    const mood = MOODS.reduce((a, m) => (this.scores[m] > this.scores[a] ? m : a), 'neutral' as Mood);
    return { mood, scores: { ...this.scores } };
  }
}

export interface BlinkState {
  /** Eye closure 0..1 (MediaPipe naming: eyeBlinkLeft / eyeBlinkRight). */
  left: number;
  right: number;
  eyesClosed: boolean;
  /** How long both eyes have been closed (ms), 0 when open. */
  closedMs: number;
  blinks: number;
  blinksPerMinute: number;
  winksLeft: number;
  winksRight: number;
  /** Events detected in this frame. */
  blinked: boolean;
  wink: 'left' | 'right' | null;
}

export interface BlinkOptions {
  /** Closure score above which an eye counts as closed. Default 0.5. */
  closeThreshold?: number;
  /** Score below which it counts as open again (hysteresis). Default 0.3. */
  openThreshold?: number;
  /** Longest closure still counted as a blink (ms). Default 500. */
  maxBlinkMs?: number;
  /** Window for blinks-per-minute (ms). Default 60000. */
  rateWindowMs?: number;
}

/** Counts blinks and winks, and tracks how long the eyes stay closed (drowsiness). */
export class BlinkDetector {
  private o: Required<BlinkOptions>;
  private closed = { left: false, right: false };
  private closedSince = { both: 0, left: 0, right: 0 };
  private blinkTimes: number[] = [];
  private counts = { blinks: 0, winksLeft: 0, winksRight: 0 };

  constructor(opts: BlinkOptions = {}) {
    this.o = { closeThreshold: 0.5, openThreshold: 0.3, maxBlinkMs: 500, rateWindowMs: 60000, ...opts };
  }

  reset() {
    this.blinkTimes = [];
    this.counts = { blinks: 0, winksLeft: 0, winksRight: 0 };
  }

  update(categories: Cat[] | undefined, now = performance.now()): BlinkState {
    const b = blendshapeMap(categories);
    const left = b.eyeBlinkLeft ?? 0;
    const right = b.eyeBlinkRight ?? 0;
    const { closeThreshold: c, openThreshold: o } = this.o;
    const was = { ...this.closed };
    const bothWereClosed = was.left && was.right;
    const next = {
      left: was.left ? left > o : left > c,
      right: was.right ? right > o : right > c,
    };
    if (next.left && !was.left) this.closedSince.left = now;
    if (next.right && !was.right) this.closedSince.right = now;
    const bothClosed = next.left && next.right;
    if (bothClosed && !bothWereClosed) this.closedSince.both = now;

    let blinked = false;
    let wink: BlinkState['wink'] = null;
    // Blink: both eyes were closed and reopen quickly.
    if (bothWereClosed && !bothClosed && now - this.closedSince.both <= this.o.maxBlinkMs) {
      blinked = true;
      this.counts.blinks++;
      this.blinkTimes.push(now);
    }
    // Wink: one eye closes and reopens while the other stays clearly open.
    for (const side of ['left', 'right'] as const) {
      const other = side === 'left' ? right : left;
      const dur = now - this.closedSince[side];
      if (was[side] && !next[side] && !bothWereClosed && other < o && dur > 120 && dur < 900) {
        wink = side;
        if (side === 'left') this.counts.winksLeft++;
        else this.counts.winksRight++;
      }
    }
    this.closed = next;
    this.blinkTimes = this.blinkTimes.filter((t) => now - t <= this.o.rateWindowMs);
    const span = Math.min(this.o.rateWindowMs, Math.max(10000, now - (this.blinkTimes[0] ?? now)));
    return {
      left,
      right,
      eyesClosed: bothClosed,
      closedMs: bothClosed ? now - this.closedSince.both : 0,
      ...this.counts,
      blinksPerMinute: Math.round((this.blinkTimes.length * 60000) / span),
      blinked,
      wink,
    };
  }
}
