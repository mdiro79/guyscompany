import type { Rules } from './types';
import { rng, type Rnd } from '../kit/rng';

// Cannon Clash. Cannons on rolling hills take turns to fire a shell: an angle, a power, gravity and the
// wind. The blast digs a crater and hurts cannons near it (the closer, the more). A cannon without
// health is out; the last one standing wins. The shooter's device works out the flight and sends the
// result (the path is kept for everyone's animation).

export const WW = 900, WH = 480, COLW = 10, COLS = WW / COLW, GRAVITY = 300, BLAST = 48, MAX_HP = 100, MAX_SHOTS = 80;
export interface Tank { c: number; hp: number }
export interface Shot { seat: number; a: number; p: number; path: number[]; hit: [number, number] | null; dmg: number[] }
export interface CannonsState { h: number[]; tanks: Tank[]; turn: number; wind: number; seed: number; n: number; shot: Shot | null; aim: [number, number][] }
export interface CannonsMove { a: number; p: number } // angle in degrees (0 right, 90 up, 180 left), power 10–100

export function groundAt(h: number[], x: number) {
  const f = Math.max(0, Math.min(COLS - 1, x / COLW - 0.5)), i = Math.floor(f), k = f - i;
  return h[i] * (1 - k) + h[Math.min(COLS - 1, i + 1)] * k;
}
export const tankAt = (s: Pick<CannonsState, 'h' | 'tanks'>, i: number): [number, number] => [(s.tanks[i].c + 0.5) * COLW, s.h[s.tanks[i].c]];

/** Flies a shell; returns its path (x, y pairs) and where it struck (null: it left the world). */
export function fly(s: Pick<CannonsState, 'h' | 'tanks' | 'wind'>, seat: number, a: number, p: number): { path: number[]; hit: [number, number] | null } {
  const [tx, ty] = tankAt(s, seat), rad = (a * Math.PI) / 180, speed = p * 6, dt = 1 / 90;
  let x = tx, y = ty + 16, vx = Math.cos(rad) * speed, vy = Math.sin(rad) * speed;
  const path: number[] = [Math.round(x), Math.round(y)];
  for (let step = 1; step < 1400; step++) {
    vx += s.wind * 42 * dt; vy -= GRAVITY * dt;
    x += vx * dt; y += vy * dt;
    if (step % 3 === 0 && path.length < 800) path.push(Math.round(x), Math.round(y));
    if (x < -160 || x > WW + 160 || y < -60) return { path, hit: null };
    if (x >= 0 && x <= WW && y <= groundAt(s.h, x)) { const hit: [number, number] = [Math.round(x), Math.round(groundAt(s.h, x))]; path.push(hit[0], hit[1]); return { path, hit }; }
    for (let j = 0; j < s.tanks.length; j++) {
      if (s.tanks[j].hp <= 0 || (j === seat && step < 25)) continue;
      const [ox, oy] = tankAt(s, j);
      if ((x - ox) ** 2 + (y - oy - 7) ** 2 < 13 * 13) { path.push(Math.round(x), Math.round(y)); return { path, hit: [Math.round(x), Math.round(y)] }; }
    }
  }
  return { path, hit: null };
}
const windFor = (seed: number, n: number) => Math.round((rng(seed * 11 + n * 7919 + 9)() * 2 - 1) * 100) / 100;
const alive = (s: Pick<CannonsState, 'tanks'>) => s.tanks.flatMap((t, i) => (t.hp > 0 ? [i] : []));

export const rules: Rules<CannonsState, CannonsMove> = {
  players: [2, 4],
  init(n, seed, first) {
    const r: Rnd = rng(seed), ph = [r() * 6, r() * 6, r() * 6], h: number[] = [];
    for (let i = 0; i < COLS; i++) {
      const u = i / COLS;
      h.push(Math.round(Math.max(60, Math.min(320, 170 + Math.sin(u * 5 + ph[0]) * 62 + Math.sin(u * 11 + ph[1]) * 34 + Math.sin(u * 23 + ph[2]) * 14))));
    }
    const tanks: Tank[] = [];
    for (let i = 0; i < n; i++) {
      const c = Math.max(3, Math.min(COLS - 4, Math.round(((i + 0.5) / n) * COLS + (r() - 0.5) * (COLS / n) * 0.45)));
      for (let d = -2; d <= 2; d++) h[c + d] = h[c]; // a small ledge to stand on
      tanks.push({ c, hp: MAX_HP });
    }
    return { h, tanks, turn: first % n, wind: windFor(seed, 0), seed, n: 0, shot: null, aim: tanks.map((t): [number, number] => [t.c < COLS / 2 ? 60 : 120, 60]) };
  },
  turn: (s) => (alive(s).length <= 1 || s.n >= MAX_SHOTS ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || alive(s).length <= 1 || s.n >= MAX_SHOTS || !m || !Number.isFinite(m.a) || !Number.isFinite(m.p)) return null;
    const a = Math.max(0, Math.min(180, m.a)), p = Math.max(10, Math.min(100, m.p));
    const { path, hit } = fly(s, seat, a, p);
    const h = s.h.slice(), tanks = s.tanks.map((t) => ({ ...t })), dmg = tanks.map(() => 0);
    if (hit) {
      for (let j = 0; j < tanks.length; j++) {
        if (tanks[j].hp <= 0) continue;
        const [ox, oy] = tankAt(s, j), d = Math.hypot(ox - hit[0], oy + 7 - hit[1]);
        if (d < BLAST + 16) { dmg[j] = Math.max(5, Math.ceil(70 * (1 - d / (BLAST + 16)))); tanks[j].hp = Math.max(0, tanks[j].hp - dmg[j]); }
      }
      for (let i = 0; i < COLS; i++) {
        const dx = (i + 0.5) * COLW - hit[0];
        if (Math.abs(dx) < BLAST) h[i] = Math.round(Math.min(h[i], Math.max(10, hit[1] - Math.sqrt(BLAST * BLAST - dx * dx) * 0.75)));
      }
    }
    const next = { ...s, h, tanks, n: s.n + 1, wind: windFor(s.seed, s.n + 1), shot: { seat, a, p, path, hit, dmg }, aim: s.aim.map((v, i): [number, number] => (i === seat ? [a, p] : v)) };
    let turn = seat;
    for (let k = 0; k < tanks.length; k++) { turn = (turn + 1) % tanks.length; if (tanks[turn].hp > 0) break; }
    return { ...next, turn };
  },
  result(s) {
    const left = alive(s);
    if (left.length > 1 && s.n < MAX_SHOTS) return null;
    const top = Math.max(...s.tanks.map((t) => t.hp));
    return { winners: top > 0 ? s.tanks.flatMap((t, i) => (t.hp === top ? [i] : [])) : [], scores: s.tanks.map((t) => t.hp) };
  },
  bot(s, seat, rnd) {
    // Tries many shots in its head, keeps the one landing nearest to an enemy, then aims a little off.
    const foes = alive(s).filter((i) => i !== seat).map((i) => tankAt(s, i));
    const [mx] = tankAt(s, seat);
    let best = { a: 60, p: 60, d: Infinity };
    for (let a = 12; a <= 168; a += 4) for (let p = 28; p <= 100; p += 6) {
      const { hit } = fly(s, seat, a, p);
      if (!hit || Math.abs(hit[0] - mx) < BLAST + 20) continue;
      for (const [fx, fy] of foes) { const d = Math.hypot(hit[0] - fx, hit[1] - fy); if (d < best.d) best = { a, p, d }; }
    }
    return { a: best.a + (rnd() - 0.5) * 12, p: best.p + (rnd() - 0.5) * 14 };
  },
};
