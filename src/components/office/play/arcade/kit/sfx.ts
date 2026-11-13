'use client';
import { music } from '../../music';

// Short game sounds, made in the browser like the jukebox's music. One mute switch for all games,
// remembered on the device.
const KEY = 'gc-arcade-mute';
let muted = false;
try { muted = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
const listeners = new Set<() => void>();

const play = (notes: number[], type: OscillatorType, gain: number, each = 0.08) => { if (!muted) music().blip(notes, type, gain, each); };

export const sfx = {
  muted: () => muted,
  setMuted(on: boolean) { muted = on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ } listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  /** A free note or run of notes (MIDI numbers). */
  note: play,
  tick: () => play([84], 'square', 0.04, 0.04),
  move: () => play([67], 'triangle', 0.09, 0.06),
  place: () => play([60, 67], 'triangle', 0.11, 0.05),
  point: (step = 0) => play([72 + Math.min(14, step)], 'square', 0.06, 0.07),
  good: () => play([76, 81, 88], 'square', 0.07, 0.07),
  great: () => play([72, 76, 79, 84, 88], 'triangle', 0.11, 0.07),
  bad: () => play([52, 47], 'sawtooth', 0.08, 0.1),
  hit: () => play([45, 40], 'sawtooth', 0.1, 0.06),
  boom: () => play([38, 33, 28], 'sawtooth', 0.14, 0.07),
  start: () => play([72, 76, 79], 'square', 0.07, 0.08),
  win: () => play([72, 76, 79, 84, 79, 84, 88], 'triangle', 0.12, 0.1),
  lose: () => play([67, 64, 60, 55], 'triangle', 0.11, 0.14),
  dice: () => play([70, 65, 72, 63, 68], 'square', 0.035, 0.04),
};
export type Sfx = typeof sfx;
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
