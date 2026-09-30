/**
 * Lightweight energy-based voice activity detector with an adaptive noise floor.
 * Splits a continuous 16 kHz stream into speech segments.
 */

export interface VadOptions {
  sampleRate?: number;
  /** Frame length in ms. Default 30. */
  frameMs?: number;
  /** Speech must exceed noise floor × this. Default 3. */
  ratio?: number;
  /** Absolute minimum RMS for speech. Default 0.008. */
  minRms?: number;
  /** Frames above threshold to start. Default 3 (~90 ms). */
  startFrames?: number;
  /** Silence to end a segment (ms). Default 650. */
  endSilenceMs?: number;
  /** Audio kept before the start trigger (ms). Default 300. */
  preRollMs?: number;
  /** Force-cut long segments (ms). Default 12000. */
  maxSegmentMs?: number;
  /** Drop segments shorter than this (ms). Default 250. */
  minSegmentMs?: number;
}

export interface VadEvents {
  onSpeechStart?: () => void;
  /** Called periodically while speaking with the audio so far (for interim transcription). */
  onSpeechProgress?: (audioSoFar: Float32Array) => void;
  onSpeechEnd?: (segment: Float32Array) => void;
}

const concat = (chunks: Float32Array[]) => {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
};

export class EnergyVad {
  private o: Required<VadOptions>;
  private frameLen: number;
  private pending: number[] = [];
  private noise = 0.005;
  private above = 0;
  private silent = 0;
  private speaking = false;
  private pre: Float32Array[] = [];
  private seg: Float32Array[] = [];
  private progressEvery: number;
  private sinceProgress = 0;

  constructor(private ev: VadEvents = {}, opts: VadOptions = {}, progressMs = 1500) {
    this.o = { sampleRate: 16000, frameMs: 30, ratio: 3, minRms: 0.008, startFrames: 3, endSilenceMs: 650, preRollMs: 300, maxSegmentMs: 12000, minSegmentMs: 250, ...opts };
    this.frameLen = Math.round((this.o.sampleRate * this.o.frameMs) / 1000);
    this.progressEvery = Math.round(progressMs / this.o.frameMs);
  }

  get isSpeaking() {
    return this.speaking;
  }

  /** Feed raw samples of any length. */
  push(chunk: Float32Array) {
    for (let i = 0; i < chunk.length; i++) this.pending.push(chunk[i]);
    while (this.pending.length >= this.frameLen) this.frame(Float32Array.from(this.pending.splice(0, this.frameLen)));
  }

  /** Force-finish the current segment (e.g. when stopping). */
  flush() {
    if (this.speaking) this.end();
  }

  private frame(f: Float32Array) {
    let s = 0;
    for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    const rms = Math.sqrt(s / f.length);
    const thr = Math.max(this.o.minRms, this.noise * this.o.ratio);
    const { frameMs } = this.o;

    if (!this.speaking) {
      // Track background noise only while not speaking.
      this.noise += (rms - this.noise) * (rms < thr ? 0.05 : 0.005);
      this.pre.push(f);
      if (this.pre.length > this.o.preRollMs / frameMs) this.pre.shift();
      this.above = rms > thr ? this.above + 1 : 0;
      if (this.above >= this.o.startFrames) {
        this.speaking = true;
        this.seg = [...this.pre];
        this.pre = [];
        this.silent = 0;
        this.sinceProgress = 0;
        this.ev.onSpeechStart?.();
      }
      return;
    }

    this.seg.push(f);
    this.silent = rms < thr * 0.7 ? this.silent + 1 : 0;
    if (++this.sinceProgress >= this.progressEvery) {
      this.sinceProgress = 0;
      this.ev.onSpeechProgress?.(concat(this.seg));
    }
    if (this.silent * frameMs >= this.o.endSilenceMs || this.seg.length * frameMs >= this.o.maxSegmentMs) this.end();
  }

  private end() {
    this.speaking = false;
    this.above = 0;
    const seg = this.seg;
    this.seg = [];
    if (seg.length * this.o.frameMs >= this.o.minSegmentMs) this.ev.onSpeechEnd?.(concat(seg));
  }
}
