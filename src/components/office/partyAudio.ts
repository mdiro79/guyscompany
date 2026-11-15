'use client';
import { syncedNow } from '@/lib/realtime/room';
import { Engine, STYLES, type Style } from './play/music';
import { party, partyPhase, partyNow, type PartyState } from './party';
import { CONF_RADIUS, inConference, type Vec2 } from './layout';

// The party room's music on this device, and what the light show listens to. The track is the same for
// everyone and started at a shared moment: a member's song is fetched once and played from where the
// party is in it (re-aligned if it drifts); a built-in track is made right here like the jukebox's music.
// The sound goes through an analyser: bass, middle, treble and beats drive the lights, so they follow
// whatever is playing. Loud in the room, fading outside it, off further away. "Mute for me" per device.

export const PARTY_STYLE_LIST: Style[] = [
  // Disco: four on the floor, a bouncing octave bass
  { bpm: 118, chords: [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [52, 56, 59, 62]], pad: 'sawtooth', arp: 'square', drums: 'four', cutoff: 2600, bassEvery: [0, 2, 4, 6, 8, 10, 12, 14] },
  // House: bright stabs, steady kick
  { bpm: 124, chords: [[62, 65, 69, 72], [60, 64, 67, 71], [58, 62, 65, 69], [57, 60, 64, 67]], pad: 'square', arp: 'triangle', drums: 'four', cutoff: 3000, bassEvery: [2, 6, 10, 14] },
  STYLES[3], // party
  STYLES[1], // synthwave
];
const MUTE_KEY = 'gc-party-mute';
const FAR = 15; // metres from the room's middle where the music stops on this device

export interface Levels { bass: number; mid: number; high: number; level: number; beat: number; playing: boolean }
const SILENT: Levels = { bass: 0, mid: 0, high: 0, level: 0, beat: -10, playing: false };

let ctx: AudioContext | null = null, volume: GainNode | null = null, analyser: AnalyserNode | null = null;
let engine: Engine | null = null, el: HTMLAudioElement | null = null;
let playingKey = '', listener: Vec2 | null = null, muted = false, timer: ReturnType<typeof setInterval> | null = null;
const urls = new Map<string, Promise<string>>();
const freq = new Uint8Array(512);
let bassAvg = 0, lastBeat = -10, levels: Levels = SILENT, levelsAt = -1;
const muteListeners = new Set<() => void>();
try { muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }

function ensure() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.55;
  volume = ctx.createGain(); volume.gain.value = 0;
  analyser.connect(volume).connect(ctx.destination);
  const wake = () => { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {}); };
  window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', wake);
  return ctx;
}

// A member's song, fetched whole once (so it can start anywhere, wherever the party is in it).
const songUrl = (fileId: string) => {
  let p = urls.get(fileId);
  if (!p) {
    p = fetch(`/api/files/${fileId}`).then((r) => { if (!r.ok) throw new Error('song'); return r.blob(); }).then((b) => URL.createObjectURL(b));
    p.catch(() => urls.delete(fileId));
    urls.set(fileId, p);
  }
  return p;
};

function loudness() {
  if (!listener || muted) return 0;
  if (inConference(listener[0], listener[1])) return 0.9;
  const d = Math.hypot(listener[0], listener[1]);
  return 0.5 * Math.max(0, Math.min(1, 1 - (d - CONF_RADIUS) / 8));
}

function stopAll() {
  engine?.stop();
  if (el) { el.pause(); }
  playingKey = '';
}

// Where a looping song should be right now.
const offsetOf = (s: PartyState, duration: number) => (duration > 0 ? (((syncedNow() - s.startedAt) / 1000) % duration + duration) % duration : 0);

function apply() {
  const s = party.get();
  const near = !!listener && Math.hypot(listener[0], listener[1]) < FAR;
  if (!s.track || !near) { stopAll(); if (volume && ctx) volume.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
  const c = ensure();
  if (!c || !analyser || !volume) return;
  void c.resume().catch(() => {});
  volume.gain.setTargetAtTime(loudness(), c.currentTime, 0.3);
  const key = s.track.kind === 'style' ? `style:${s.track.style}:${s.startedAt}` : `song:${s.track.fileId}:${s.startedAt}`;
  if (key === playingKey) { realign(); return; }
  stopAll();
  playingKey = key;
  if (s.track.kind === 'style') {
    engine ??= new Engine({ ctx: c, out: analyser });
    engine.play(PARTY_STYLE_LIST[s.track.style] ?? PARTY_STYLE_LIST[0]);
    engine.setVolume(0.55);
    return;
  }
  const want = key, id = s.track.fileId;
  void songUrl(id).then((url) => {
    if (playingKey !== want) return;
    if (!el) {
      el = new Audio();
      el.loop = true;
      el.preload = 'auto';
      c.createMediaElementSource(el).connect(analyser!);
    }
    if (el.src !== url) el.src = url;
    const start = () => { if (playingKey !== want || !el) return; el.currentTime = offsetOf(party.get(), el.duration); void el.play().catch(() => {}); };
    if (el.readyState >= 1) start(); else el.onloadedmetadata = start;
  }).catch(() => { if (playingKey === want) playingKey = ''; });
}

// A song that drifted from the shared moment (a pause, a slow phone) is moved back in step.
function realign() {
  const s = party.get();
  if (!el || s.track?.kind !== 'song' || el.readyState < 1 || !el.duration) return;
  const want = offsetOf(s, el.duration);
  let drift = Math.abs(el.currentTime - want);
  drift = Math.min(drift, el.duration - drift);
  if (drift > 0.4) el.currentTime = want;
  if (el.paused) void el.play().catch(() => {});
}

export const partyAudio = {
  /** Where this device's listener stands (null when leaving the office: the music stops). */
  listen(pos: Vec2 | null) { listener = pos; apply(); },
  muted: () => muted,
  setMuted(on: boolean) {
    muted = on;
    try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    apply(); muteListeners.forEach((l) => l());
  },
  subscribeMute(l: () => void) { muteListeners.add(l); return () => { muteListeners.delete(l); }; },
  /** Bass, middle and treble now (0…1) and when the last beat was (seconds, performance clock). Call once a frame. */
  levels(): Levels {
    // Once a frame at most (the rig and the jumping both ask), so beats are counted right.
    const at = performance.now();
    if (at - levelsAt < 8) return levels;
    levelsAt = at;
    const s = party.get();
    if (!analyser || !s.track || !playingKey) { levels = SILENT; return levels; }
    analyser.getByteFrequencyData(freq);
    const avg = (a: number, b: number) => { let t = 0; for (let i = a; i < b; i++) t += freq[i]; return t / ((b - a) * 255); };
    const hzPerBin = (ctx?.sampleRate ?? 48000) / analyser.fftSize, bin = (hz: number) => Math.max(1, Math.round(hz / hzPerBin));
    const bass = avg(bin(40), bin(180)), mid = avg(bin(250), bin(2000)), high = avg(bin(2500), Math.min(freq.length, bin(10000)));
    const now = performance.now() / 1000;
    bassAvg += (bass - bassAvg) * 0.06;
    if (bass > bassAvg * 1.22 + 0.03 && now - lastBeat > 0.24) lastBeat = now;
    levels = { bass, mid, high, level: (bass + mid + high) / 3, beat: lastBeat, playing: true };
    return levels;
  },
};

/**
 * How high someone at (x, z) jumps right now at a party (metres; 0 when nobody is jumping): everyone in the
 * room hops on the beat of the music (a steady hop without music), each a little out of step with the
 * others (`seed`). Computed on every device for everyone, so it needs nothing over the network.
 */
export function partyHop(x: number, z: number, seed: number) {
  const s = party.get();
  if (!s.lights.jump || !inConference(x, z)) return 0;
  const rig = partyPhase(s, partyNow()).rig;
  if (rig < 0.5) return 0;
  const now = performance.now() / 1000, lv = partyAudio.levels(), lag = (seed % 7) * 0.012;
  let k: number;
  if (lv.playing && now - lv.beat < 1.2) k = Math.max(0, Math.min(1, (now - lv.beat - lag) / 0.4));
  else k = ((now + seed * 0.37) * 2) % 1; // two hops a second
  return 0.24 * Math.sin(Math.PI * k) * Math.min(1, (rig - 0.5) * 2);
}
export const hopSeed = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 1000; };

/** Starts following the shared state (once, from the office view). */
export function startPartyAudio() {
  const off = party.subscribe(apply);
  timer ??= setInterval(() => { if (party.get().track) apply(); }, 1500);
  apply();
  return () => { off(); if (timer) clearInterval(timer); timer = null; partyAudio.listen(null); stopAll(); };
}
