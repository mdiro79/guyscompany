'use client';
import { useSyncExternalStore } from 'react';

// The arcade's own look ("Toybox"): flat, friendly shapes with an ink outline and a crisp drop shadow,
// soft paper backgrounds with slowly drifting blobs, confetti and springy motion. Every game paints with
// the same palette, in a light or a dark version chosen by the player (kept on the device).

export interface Palette {
  dark: boolean;
  bg0: string; bg1: string; // background, top and bottom
  blobs: string[]; // big soft shapes drifting behind the game
  ink: string; // outlines
  text: string; soft: string; // text on the background
  paper: string; // surfaces (cards, boards)
  paper2: string; // a second, slightly different surface (board squares)
  line: string; // faint lines and dots
  shadow: string;
  coral: string; sun: string; mint: string; sky: string; grape: string; pink: string; orange: string; teal: string; white: string;
}

const ACCENTS = { coral: '#ff6b5e', sun: '#ffc93c', mint: '#3ccf91', sky: '#4aa8ff', grape: '#9b6bff', pink: '#ff7eb6', orange: '#ff9f43', teal: '#22c1b4', white: '#ffffff' };
const LIGHT: Palette = {
  dark: false, bg0: '#fff6e6', bg1: '#ffe6cf', blobs: ['#ffd9b8', '#ffe9a8', '#cdeeff', '#ffd3e4'], ink: '#2b2440', text: '#2b2440', soft: 'rgba(43,36,64,0.6)',
  paper: '#ffffff', paper2: '#f3e7d6', line: 'rgba(43,36,64,0.1)', shadow: 'rgba(43,36,64,0.22)', ...ACCENTS,
};
const DARK: Palette = {
  dark: true, bg0: '#1c1733', bg1: '#2a1f47', blobs: ['#3a2a63', '#22365c', '#472a52', '#1f4450'], ink: '#0e0a1c', text: '#fff5e6', soft: 'rgba(255,245,230,0.62)',
  paper: '#362b5c', paper2: '#2b2249', line: 'rgba(255,245,230,0.09)', shadow: 'rgba(0,0,0,0.38)', ...ACCENTS,
};

const KEY = 'gc-arcade-theme';
let mode: 'light' | 'dark' | null = null;
const listeners = new Set<() => void>();
function current(): 'light' | 'dark' {
  if (mode) return mode;
  if (typeof window === 'undefined') return 'dark';
  try { const saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') return (mode = saved); } catch { /* storage blocked */ }
  // Until the player chooses, the arcade follows the app's theme.
  return (mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

export const theme = {
  mode: current,
  /** The colours to paint with right now (cheap: call it every frame). */
  get: (): Palette => (current() === 'dark' ? DARK : LIGHT),
  set(m: 'light' | 'dark') { mode = m; try { localStorage.setItem(KEY, m); } catch { /* storage blocked */ } listeners.forEach((l) => l()); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useThemeMode = () => useSyncExternalStore(theme.subscribe, current, () => 'dark' as const);
/** Player colours, in seat order. */
export const seatColors = (p: Palette) => [p.coral, p.sky, p.sun, p.mint, p.grape, p.pink];
