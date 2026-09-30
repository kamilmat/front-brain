/**
 * Turns MediaPipe GestureRecognizer results into UI-friendly events:
 * an air pointer (index fingertip), pinch-to-click, swipes and stable named gestures.
 */

export type GestureName = 'Thumb_Up' | 'Thumb_Down' | 'Victory' | 'Open_Palm' | 'Closed_Fist' | 'Pointing_Up' | 'ILoveYou';

export type GestureEvent =
  | { type: 'gesture'; name: GestureName; score: number }
  | { type: 'pinch'; x: number; y: number }
  | { type: 'pinchEnd'; x: number; y: number }
  | { type: 'swipe'; direction: 'left' | 'right' | 'up' | 'down' };

export interface GestureFrame {
  /** Smoothed index-fingertip position in 0..1 (after mirroring/margins), null when no hand. */
  pointer: { x: number; y: number } | null;
  pinching: boolean;
  /** Current (stable) gesture name or null. */
  gesture: GestureName | null;
  events: GestureEvent[];
}

export interface GestureControllerOptions {
  /** Mirror x (selfie camera). Default true. */
  mirror?: boolean;
  /** Frames a gesture must persist before it fires. Default 5. */
  holdFrames?: number;
  /** Minimum classifier score for a gesture. Default 0.6. */
  minScore?: number;
  /** Pinch distance relative to hand size. Default 0.35 (release at +0.1 hysteresis). */
  pinchThreshold?: number;
  /** Fraction of frame the wrist must travel for a swipe. Default 0.22. */
  swipeDistance?: number;
  /** Max duration of a swipe (ms). Default 450. */
  swipeWindowMs?: number;
  /** Map the central part of the camera frame to the full 0..1 range (easier to reach edges). Default 0.12. */
  margin?: number;
  /** Pointer smoothing 0..1 (higher = snappier). Default 0.45. */
  smoothing?: number;
}

type P = { x: number; y: number; z?: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

export class GestureController {
  private o: Required<GestureControllerOptions>;
  private pointer: { x: number; y: number } | null = null;
  private pinching = false;
  private candidate: { name: GestureName | null; frames: number } = { name: null, frames: 0 };
  private stable: GestureName | null = null;
  private trail: { x: number; y: number; t: number }[] = [];
  private lastSwipe = 0;

  constructor(opts: GestureControllerOptions = {}) {
    this.o = {
      mirror: true,
      holdFrames: 5,
      minScore: 0.6,
      pinchThreshold: 0.35,
      swipeDistance: 0.22,
      swipeWindowMs: 450,
      margin: 0.12,
      smoothing: 0.45,
      ...opts,
    };
  }

  /** Feed one GestureRecognizer result (first hand is used). */
  update(result: { landmarks?: P[][]; gestures?: { categoryName: string; score: number }[][] }, now = performance.now()): GestureFrame {
    const events: GestureEvent[] = [];
    const lm = result.landmarks?.[0];
    if (!lm) {
      if (this.pinching && this.pointer) events.push({ type: 'pinchEnd', ...this.pointer });
      this.pointer = null;
      this.pinching = false;
      this.candidate = { name: null, frames: 0 };
      this.stable = null;
      this.trail = [];
      return { pointer: null, pinching: false, gesture: null, events };
    }

    // Pointer: index fingertip (8), mirrored + margin-expanded + smoothed.
    const { mirror, margin, smoothing } = this.o;
    const map = (v: number) => Math.min(1, Math.max(0, (v - margin) / (1 - 2 * margin)));
    const raw = { x: map(mirror ? 1 - lm[8].x : lm[8].x), y: map(lm[8].y) };
    this.pointer = this.pointer ? { x: this.pointer.x + (raw.x - this.pointer.x) * smoothing, y: this.pointer.y + (raw.y - this.pointer.y) * smoothing } : raw;

    // Pinch: thumb tip (4) to index tip (8), normalised by palm size (wrist 0 → middle MCP 9).
    const handSize = dist(lm[0], lm[9]) || 1;
    const pinchRatio = dist(lm[4], lm[8]) / handSize;
    if (!this.pinching && pinchRatio < this.o.pinchThreshold) {
      this.pinching = true;
      events.push({ type: 'pinch', ...this.pointer });
    } else if (this.pinching && pinchRatio > this.o.pinchThreshold + 0.1) {
      this.pinching = false;
      events.push({ type: 'pinchEnd', ...this.pointer });
    }

    // Stable gestures (fire once when they appear).
    const top = result.gestures?.[0]?.[0];
    const name = top && top.categoryName !== 'None' && top.score >= this.o.minScore ? (top.categoryName as GestureName) : null;
    if (name === this.candidate.name) this.candidate.frames++;
    else this.candidate = { name, frames: 1 };
    if (this.candidate.frames === this.o.holdFrames && name !== this.stable) {
      this.stable = name;
      if (name) events.push({ type: 'gesture', name, score: top!.score });
    }
    if (!name && this.candidate.frames >= this.o.holdFrames) this.stable = null;

    // Swipe: fast wrist travel with an open hand (not while pinching).
    const wrist = { x: mirror ? 1 - lm[0].x : lm[0].x, y: lm[0].y, t: now };
    this.trail.push(wrist);
    this.trail = this.trail.filter((p) => now - p.t <= this.o.swipeWindowMs);
    if (!this.pinching && now - this.lastSwipe > 700 && this.trail.length > 3) {
      const first = this.trail[0];
      const dx = wrist.x - first.x;
      const dy = wrist.y - first.y;
      const d = this.o.swipeDistance;
      if (Math.abs(dx) > d && Math.abs(dx) > Math.abs(dy) * 1.8) {
        events.push({ type: 'swipe', direction: dx > 0 ? 'right' : 'left' });
        this.lastSwipe = now;
        this.trail = [];
      } else if (Math.abs(dy) > d && Math.abs(dy) > Math.abs(dx) * 1.8) {
        events.push({ type: 'swipe', direction: dy > 0 ? 'down' : 'up' });
        this.lastSwipe = now;
        this.trail = [];
      }
    }

    return { pointer: this.pointer, pinching: this.pinching, gesture: this.stable, events };
  }
}
