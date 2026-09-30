/** Microphone capture at a fixed sample rate (16 kHz for speech models) via an AudioWorklet. */

export interface MicStream {
  sampleRate: number;
  /** Current input level 0..1 (RMS of the last chunk). */
  level(): number;
  stop(): void;
}

const WORKLET = `class FbTap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('fb-tap', FbTap);`;

export async function startMic(onAudio: (chunk: Float32Array) => void, { sampleRate = 16000, deviceId }: { sampleRate?: number; deviceId?: string } = {}): Promise<MicStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId } : {}) },
  });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate });
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(`This browser cannot capture audio at ${sampleRate} Hz.`);
  }
  let lvl = 0;
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'fb-tap');
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const d = e.data;
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    lvl = Math.sqrt(s / d.length);
    onAudio(d);
  };
  src.connect(node);
  // Keep the graph pulling without making noise.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate,
    level: () => Math.min(1, lvl * 6),
    stop() {
      node.port.onmessage = null;
      src.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
