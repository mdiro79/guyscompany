'use client';

// The jukebox's music is made in the browser (Web Audio): chords, bass, a little melody and drums from a
// few numbers per style. Nothing is downloaded and nothing is streamed; each listener's device plays it.

export interface Style { bpm: number; chords: number[][]; pad: OscillatorType; arp: OscillatorType | null; drums: 'none' | 'soft' | 'four'; cutoff: number; bassEvery: number[] }
// Chords as MIDI notes (around middle C).
export const STYLES: Style[] = [
  { bpm: 78, chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]], pad: 'triangle', arp: 'sine', drums: 'soft', cutoff: 1400, bassEvery: [0, 10] }, // lo-fi
  { bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], pad: 'sawtooth', arp: 'square', drums: 'four', cutoff: 1800, bassEvery: [0, 2, 4, 6, 8, 10, 12, 14] }, // synthwave
  { bpm: 60, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], pad: 'sine', arp: null, drums: 'none', cutoff: 1100, bassEvery: [0] }, // calm
  { bpm: 122, chords: [[60, 63, 67], [56, 60, 63], [63, 67, 70], [58, 62, 65]], pad: 'sawtooth', arp: 'triangle', drums: 'four', cutoff: 2400, bassEvery: [0, 3, 6, 8, 11, 14] }, // party
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const LOOKAHEAD_S = 0.25, TICK_MS = 80;

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private style: Style | null = null;
  private step = 0;
  private nextTime = 0;
  private volume = 0;

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const comp = ctx.createDynamicsCompressor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx; this.master = master; this.noise = noise;
    // Browsers only start sound after a tap or a key press on the page.
    const wake = () => { void ctx.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    return ctx;
  }

  get playing() { return !!this.timer; }

  play(style: Style) {
    const ctx = this.ensure();
    if (!ctx) return;
    void ctx.resume();
    if (this.style === style && this.timer) return;
    this.style = style;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer ??= setInterval(() => this.schedule(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.style = null;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    this.volume = 0;
  }

  setVolume(v: number) {
    if (!this.ctx || !this.master || Math.abs(v - this.volume) < 0.005) return;
    this.volume = v;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  /** A short sound of its own (coffee machine, timer bell, a game point): `notes` in MIDI, one after another. */
  blip(notes: number[], type: OscillatorType = 'sine', gain = 0.2, each = 0.11) {
    const ctx = this.ensure();
    if (!ctx) return;
    void ctx.resume();
    notes.forEach((n, i) => {
      const t = ctx.currentTime + 0.02 + i * each;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = hz(n);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + each * 2.2);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + each * 2.4);
    });
  }

  private schedule() {
    const ctx = this.ctx, style = this.style;
    if (!ctx || !style || ctx.state !== 'running') return;
    const stepS = 60 / style.bpm / 4;
    // After a pause (background tab) continue from now instead of catching up in a burst.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(style, this.step, this.nextTime, stepS);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepS;
    }
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, gain: number, attack = 0.01, cutoff = 0, detune = 0) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f).connect(g);
    } else o.connect(g);
    g.connect(this.master!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private hit(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t); src.stop(t + dur + 0.02);
  }

  private kick(t: number, gain: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.22);
  }

  private playStep(s: Style, step: number, t: number, stepS: number) {
    const bar = Math.floor(step / 16), i = step % 16;
    const chord = s.chords[bar % s.chords.length];
    if (i === 0) {
      // Pad: the whole chord for one bar, two slightly detuned voices per note.
      for (const n of chord) for (const d of [-6, 6]) this.tone(s.pad, hz(n), t, stepS * 16.5, s.pad === 'sawtooth' ? 0.035 : 0.07, stepS * 2, s.cutoff, d);
    }
    if (s.bassEvery.includes(i)) this.tone('triangle', hz(chord[0] - 24), t, stepS * 2.2, 0.22, 0.01);
    if (s.arp && i % 2 === 0) {
      const n = chord[(i / 2 + (bar % 2)) % chord.length] + 12;
      this.tone(s.arp, hz(n), t, stepS * 1.8, s.arp === 'square' ? 0.03 : 0.06, 0.005, s.cutoff * 1.5);
    }
    if (s.drums === 'soft') {
      if (i === 0 || i === 10) this.kick(t, 0.5);
      if (i === 4 || i === 12) this.hit(t, 0.12, 0.12, 'bandpass', 1800);
      if (i % 2 === 0) this.hit(t + (i % 4 === 2 ? stepS * 0.3 : 0), 0.04, 0.035, 'highpass', 7000);
    } else if (s.drums === 'four') {
      if (i % 4 === 0) this.kick(t, 0.7);
      if (i === 4 || i === 12) this.hit(t, 0.14, 0.16, 'bandpass', 1500);
      if (i % 4 === 2) this.hit(t, 0.05, 0.06, 'highpass', 8000);
    }
  }
}

let engine: Engine | null = null;
export const music = () => (engine ??= new Engine());
