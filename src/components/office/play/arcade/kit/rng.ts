// Small seeded random generator (mulberry32): the same seed gives the same game, which is what lets
// teammates race each other on an identical round.
export type Rnd = () => number;
export function rng(seed: number): Rnd {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0;
export const pick = <T,>(r: Rnd, list: readonly T[]): T => list[Math.floor(r() * list.length)];
export const irand = (r: Rnd, min: number, max: number) => min + Math.floor(r() * (max - min + 1)); // both ends included
export function shuffle<T>(r: Rnd, list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
