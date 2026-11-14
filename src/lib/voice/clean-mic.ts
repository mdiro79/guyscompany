'use client';

// The microphone as it goes to teammates: cleaned so handling noise (touching or moving the phone, taps on
// the screen or the desk) does not reach them, while speech keeps its full quality.
//
//   microphone (browser echo cancellation and noise suppression; no automatic gain, which boosted every
//   small noise between words) → low cut (rumble and thumps below speech) → speech gate → gentle compressor
//   and a little make-up gain (steady, clear speech without the browser's gain) → limiter → teammates.
//
// The speech gate (an audio worklet) listens to the speech band only and opens when sound there lasts
// long enough to be a voice (short clicks and taps do not), seeing a few milliseconds ahead so the start
// of a word is never cut. Between words it does not go fully silent, only much quieter, so the line does
// not sound dead. Where audio worklets are missing, everything but the gate still applies.

const LOOKAHEAD_S = 0.03; // audio is delayed this much so the gate opens before a word starts
export const GATE_SUSTAIN_S = 0.035; // speech-band sound must last this long to open the gate (a tap is shorter)

export const GATE_WORKLET = `
class SpeechGate extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;
    this.look = Math.max(1, Math.round(${LOOKAHEAD_S} * sr));
    this.ring = new Float32Array(this.look + 1); this.w = 0;
    // speech band for listening: one-pole high pass at ~250 Hz and low pass at ~3.8 kHz
    this.hpA = Math.exp(-2 * Math.PI * 250 / sr); this.lpB = 1 - Math.exp(-2 * Math.PI * 3800 / sr);
    this.hpY = 0; this.hpX = 0; this.lpY = 0;
    this.kEnv = 1 - Math.exp(-1 / (0.012 * sr));     // 12 ms energy smoothing
    // The room's own noise: the quietest moment of each quarter second, over the last two seconds (even
    // steady talk has quiet gaps between syllables, and a fan or traffic never goes below its own level).
    this.blockLen = Math.round(0.25 * sr); this.blockN = 0; this.blockMin = 1;
    this.mins = new Float32Array(8).fill(0.003); this.mi = 0;
    this.kOpen = 1 - Math.exp(-1 / (0.004 * sr));    // gate opens in ~4 ms
    this.kClose = 1 - Math.exp(-1 / (0.12 * sr));    // and closes over ~120 ms
    this.sustain = Math.round(${GATE_SUSTAIN_S} * sr);
    this.holdLen = Math.round(0.32 * sr);            // stays open through short pauses between words
    this.e2 = 0; this.floor = 0.003; this.above = 0; this.hold = 0; this.g = 0.06;
    this.closed = 0.06;                              // about -24 dB between words, not silence
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return true;
    const x = inp && inp.length ? inp[0] : null, y = out[0], n = y.length;
    for (let i = 0; i < n; i++) {
      const s = x ? x[i] : 0;
      // listen to the speech band
      const hp = this.hpA * (this.hpY + s - this.hpX); this.hpX = s; this.hpY = hp;
      this.lpY += this.lpB * (hp - this.lpY);
      this.e2 += this.kEnv * (this.lpY * this.lpY - this.e2);
      const env = Math.sqrt(this.e2);
      if (env < this.blockMin) this.blockMin = env;
      if (++this.blockN >= this.blockLen) {
        this.mins[this.mi] = this.blockMin; this.mi = (this.mi + 1) % this.mins.length; this.blockN = 0; this.blockMin = 1;
        let f = 1; for (let k = 0; k < this.mins.length; k++) if (this.mins[k] < f) f = this.mins[k];
        this.floor = Math.min(0.04, Math.max(0.0002, f));
      }
      // about 11 dB over the room's own noise, and never below a quiet voice's level
      const thr = Math.max(this.floor * 3.5, 0.0045);
      if (env > thr) { this.above++; if (this.above >= this.sustain || this.hold > 0) this.hold = this.holdLen; }
      else { this.above = 0; if (this.hold > 0) this.hold--; }
      const target = this.hold > 0 ? 1 : this.closed;
      this.g += (target - this.g) * (target > this.g ? this.kOpen : this.kClose);
      // play what was heard a moment ago
      const r = (this.w + 1) % this.ring.length;
      const delayed = this.ring[r];
      this.ring[this.w] = s; this.w = r;
      y[i] = delayed * this.g;
    }
    for (let c = 1; c < out.length; c++) out[c].set(y);
    return true;
  }
}
registerProcessor('gc-speech-gate', SpeechGate);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();
function loadGate(ctx: AudioContext) {
  let p = loaded.get(ctx);
  if (!p) {
    p = (async () => {
      if (!ctx.audioWorklet) return false;
      const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); return true; } catch { return false; } finally { URL.revokeObjectURL(url); }
    })();
    loaded.set(ctx, p);
  }
  return p;
}

/** What the browser is asked for: its echo cancellation and noise suppression, mono, no automatic gain. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1,
  // Chrome on some devices: the system's voice isolation, when there is one.
  ...({ voiceIsolation: true } as MediaTrackConstraints),
};

export interface CleanMic {
  track: MediaStreamTrack; // what goes to teammates
  level: AudioNode; // tap for the speaking indicator (after the gate)
  close(): void;
}

/** Builds the cleaning chain for a microphone stream; the raw stream is stopped by `close`. */
export async function cleanMic(ctx: AudioContext, raw: MediaStream): Promise<CleanMic> {
  const source = ctx.createMediaStreamSource(raw);
  const lowCut1 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 85, Q: 0.6 });
  const lowCut2 = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 85, Q: 0.9 });
  const gate = (await loadGate(ctx)) ? new AudioWorkletNode(ctx, 'gc-speech-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }) : null;
  const comp = new DynamicsCompressorNode(ctx, { threshold: -28, knee: 12, ratio: 3.5, attack: 0.004, release: 0.22 });
  const makeUp = new GainNode(ctx, { gain: 2.2 });
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
  const out = ctx.createMediaStreamDestination();
  out.channelCount = 1;
  source.connect(lowCut1).connect(lowCut2);
  const afterGate: AudioNode = gate ? (lowCut2.connect(gate), gate) : lowCut2;
  afterGate.connect(comp).connect(makeUp).connect(limiter).connect(out);
  const track = out.stream.getAudioTracks()[0];
  // When the raw microphone ends (unplugged, taken by another app), so does what teammates hear.
  raw.getAudioTracks()[0]?.addEventListener('ended', () => track.stop());
  return {
    track, level: limiter,
    close() {
      raw.getTracks().forEach((t) => t.stop());
      track.stop();
      for (const n of [source, lowCut1, lowCut2, gate, comp, makeUp, limiter]) n?.disconnect();
    },
  };
}
