import { describe, expect, it } from 'vitest';
import { GATE_WORKLET } from './clean-mic';

// Runs the speech gate's worklet code outside a browser on made-up sound, 128 samples at a time.
const SR = 48_000;
type Proc = { process(i: Float32Array[][], o: Float32Array[][]): boolean };
function makeGate(): Proc {
  let Ctor: (new () => Proc) | null = null;
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', GATE_WORKLET)(class {}, (_: string, c: new () => Proc) => { Ctor = c; }, SR);
  return new Ctor!();
}
function run(gate: Proc, input: Float32Array) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    const o = new Float32Array(128);
    gate.process([[input.subarray(i, i + 128)]], [[o]]);
    out.set(o.subarray(0, Math.min(128, input.length - i)), i);
  }
  return out;
}
const rms = (a: Float32Array, from: number, to: number) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return Math.sqrt(s / (to - from)); };
const noise = (n: number, level: number, seed = 1) => { const a = new Float32Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 16807) % 2147483647; a[i] = ((x / 2147483647) * 2 - 1) * level; } return a; };

describe('speech gate', () => {
  it('keeps a short tap quiet but lets a voice through in full', () => {
    const gate = makeGate();
    const sec = (s: number) => Math.round(s * SR);
    const sig = noise(sec(3.5), 0.001); // a quiet room
    // 0.5 s: a tap (12 ms click with a thump)
    for (let i = 0; i < sec(0.012); i++) sig[sec(0.5) + i] += 0.5 * Math.sin(i / 3) * Math.exp(-i / 150);
    // 2.0 s: half a second of a voice (a 220 Hz voice with harmonics)
    for (let i = 0; i < sec(0.5); i++) { const t = i / SR; sig[sec(2) + i] += 0.08 * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 660 * t) + 0.4 * Math.sin(2 * Math.PI * 1320 * t)); }
    const out = run(gate, sig);
    const tapIn = rms(sig, sec(0.5), sec(0.52)), tapOut = rms(out, sec(0.53), sec(0.55)); // output is 30 ms late
    expect(tapOut / tapIn).toBeLessThan(0.15);
    const voiceIn = rms(sig, sec(2.1), sec(2.4)), voiceOut = rms(out, sec(2.13), sec(2.43));
    expect(voiceOut / voiceIn).toBeGreaterThan(0.95);
    // The first word is not cut: already open at the start of the voice (it is heard 30 ms later).
    expect(rms(out, sec(2.03) + 240, sec(2.03) + 960) / rms(sig, sec(2) + 240, sec(2) + 960)).toBeGreaterThan(0.6);
  });

  it('follows a steady background noise instead of staying open for it', () => {
    const gate = makeGate();
    const sig = noise(Math.round(4 * SR), 0.03, 7); // a loud fan
    const out = run(gate, sig);
    const late = rms(out, 3 * SR, 4 * SR) / rms(sig, 3 * SR, 4 * SR);
    expect(late).toBeLessThan(0.2);
  });
});
