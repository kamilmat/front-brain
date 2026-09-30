/**
 * Tiny Web Audio synth for UI sound effects – no audio files, nothing to download.
 * The AudioContext is created lazily and resumed on the first user gesture.
 */

let ctx: AudioContext | null = null;
let enabled = true;

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const sfxEnabled = () => enabled;
export function setSfxEnabled(on: boolean) {
  enabled = on;
  if (on) ac(); // unlock audio within the click that enabled it
}

function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.2, delay = 0, slideTo }: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}) {
  if (!enabled) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, { gain = 0.2, filter = 2000, sweepTo, delay = 0 }: { gain?: number; filter?: number; sweepTo?: number; delay?: number } = {}) {
  if (!enabled) return;
  const a = ac();
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(filter, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  pop: () => tone(520 + Math.random() * 200, 0.12, { type: 'triangle', slideTo: 1400, gain: 0.25 }),
  miss: () => tone(180, 0.08, { type: 'square', gain: 0.05 }),
  whoosh: () => noise(0.35, { filter: 400, sweepTo: 3000, gain: 0.3 }),
  confetti: () => [0, 4, 7, 12].forEach((n, i) => tone(523 * 2 ** (n / 12), 0.25, { delay: i * 0.07, type: 'triangle', gain: 0.18 })),
  hearts: () => [0, 4, 7, 11, 14].forEach((n, i) => tone(440 * 2 ** (n / 12), 0.35, { delay: i * 0.09, gain: 0.15 })),
  boo: () => tone(300, 0.6, { type: 'sawtooth', slideTo: 90, gain: 0.12 }),
  shutter: () => {
    noise(0.05, { filter: 3000, gain: 0.4 });
    noise(0.07, { filter: 1800, gain: 0.3, delay: 0.08 });
  },
  reset: () => tone(660, 0.18, { type: 'square', slideTo: 220, gain: 0.08 }),
  theme: () => tone(880, 0.12, { type: 'sine', gain: 0.15 }),
  blink: () => tone(1800, 0.03, { type: 'sine', gain: 0.06 }),
  wink: () => [0, 7].forEach((n, i) => tone(988 * 2 ** (n / 12), 0.15, { delay: i * 0.08, gain: 0.15 })),
  mood: (m: string) => {
    const notes: Record<string, number[]> = { happy: [0, 4, 7], surprised: [0, 6, 12], sad: [0, 3, 7], angry: [0, 1, 6], neutral: [0, 7] };
    (notes[m] ?? [0]).forEach((n, i) => tone(392 * 2 ** (n / 12), 0.22, { delay: i * 0.06, type: m === 'angry' ? 'sawtooth' : 'triangle', gain: 0.1 }));
  },
  alarm: () => [0, 0.3, 0.6].forEach((d) => tone(880, 0.2, { delay: d, type: 'square', gain: 0.12 })),
};

/** Continuous hand-controlled synth: pitch from x, volume from y. */
export class Theremin {
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start() {
    if (this.osc || !enabled) return;
    const a = ac();
    this.osc = a.createOscillator();
    this.gain = a.createGain();
    this.osc.type = 'sine';
    this.gain.gain.value = 0;
    const vib = a.createOscillator();
    const vibGain = a.createGain();
    vib.frequency.value = 5.5;
    vibGain.gain.value = 4;
    vib.connect(vibGain).connect(this.osc.frequency);
    vib.start();
    this.osc.connect(this.gain).connect(a.destination);
    this.osc.start();
  }

  /** x, y in 0..1 (x → 130–1050 Hz, y top = loud); null silences. */
  update(p: { x: number; y: number } | null) {
    if (!this.osc || !this.gain || !ctx) return;
    const t = ctx.currentTime;
    if (!p || !enabled) {
      this.gain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    this.osc.frequency.setTargetAtTime(130 * 2 ** (p.x * 3), t, 0.03);
    this.gain.gain.setTargetAtTime(0.25 * (1 - p.y), t, 0.05);
  }

  stop() {
    this.gain?.gain.setTargetAtTime(0, ctx?.currentTime ?? 0, 0.03);
    const o = this.osc;
    setTimeout(() => o?.stop(), 200);
    this.osc = null;
    this.gain = null;
  }
}
