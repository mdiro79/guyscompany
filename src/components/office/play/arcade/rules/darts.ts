import type { Rules } from './types';
import { rng } from '../kit/rng';

// Golden Darts. Five rounds of three darts each; the highest total wins. The board scores like a real
// dartboard. One wedge is golden for each throw and doubles what lands in it; a bullseye earns a bonus
// dart. A throw is the point where the dart lands, in board units (1 = the outer edge of the double ring).

export const ROUNDS = 5, DARTS = 3;
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]; // clockwise from the top
export const RING = { bull: 0.037, outer: 0.094, triple: [0.582, 0.629], double: [0.953, 1] } as const;
export interface Dart { x: number; y: number; seat: number; pts: number; text: string }
export interface DartsState {
  scores: number[]; turn: number; first: number; left: number; round: number; wedge: number; seed: number; n: number;
  stuck: Dart[]; // the darts of the current turn (the last turn's stay until the next throw)
  fresh: boolean; // the next throw starts a new turn: the board is cleared first
}
export interface DartsMove { x: number; y: number }

/** What a dart at (x, y) scores while `wedge` is golden. */
export function scoreAt(x: number, y: number, wedge: number): { pts: number; text: string; bull: boolean } {
  const r = Math.hypot(x, y);
  if (r > RING.double[1]) return { pts: 0, text: '0', bull: false };
  if (r <= RING.bull) return { pts: 50, text: '50', bull: true };
  if (r <= RING.outer) return { pts: 25, text: '25', bull: false };
  const turn = (Math.atan2(x, -y) / (Math.PI * 2) + 1 + 1 / 40) % 1; // 0 at the top, clockwise
  const i = Math.floor(turn * 20) % 20, base = ORDER[i];
  const mult = r >= RING.triple[0] && r <= RING.triple[1] ? 3 : r >= RING.double[0] ? 2 : 1, gold = i === wedge ? 2 : 1;
  return { pts: base * mult * gold, text: `${mult > 1 ? `${mult}×` : ''}${base}${gold > 1 ? ' ×2' : ''}`, bull: false };
}
const wedgeFor = (seed: number, n: number) => Math.floor(rng(seed * 17 + n * 7919 + 3)() * 20);
/** The centre of a wedge's triple ring (where the computer and brave players aim). */
export function tripleOf(i: number): [number, number] { const a = (i / 20) * Math.PI * 2, r = (RING.triple[0] + RING.triple[1]) / 2; return [Math.sin(a) * r, -Math.cos(a) * r]; }

export const rules: Rules<DartsState, DartsMove> = {
  players: [2, 4],
  init: (n, seed, first) => ({ scores: new Array(n).fill(0), turn: first % n, first: first % n, left: DARTS, round: 0, wedge: wedgeFor(seed, 0), seed, n: 0, stuck: [], fresh: false }),
  turn: (s) => (s.round >= ROUNDS ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || s.round >= ROUNDS || !m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return null;
    const x = Math.max(-1.6, Math.min(1.6, m.x)), y = Math.max(-1.6, Math.min(1.6, m.y));
    const hit = scoreAt(x, y, s.wedge);
    const scores = s.scores.map((v, i) => (i === seat ? v + hit.pts : v));
    const stuck = [...(s.fresh ? [] : s.stuck), { x, y, seat, pts: hit.pts, text: hit.text }];
    const left = s.left - 1 + (hit.bull ? 1 : 0), n = s.n + 1;
    if (left > 0) return { ...s, scores, left, n, wedge: wedgeFor(s.seed, n), stuck, fresh: false };
    const turn = (seat + 1) % s.scores.length;
    return { ...s, scores, turn, left: DARTS, round: s.round + (turn === s.first ? 1 : 0), n, wedge: wedgeFor(s.seed, n), stuck, fresh: true };
  },
  result(s) {
    if (s.round < ROUNDS) return null;
    const top = Math.max(...s.scores);
    return { winners: s.scores.flatMap((v, i) => (v === top ? [i] : [])), scores: s.scores };
  },
  bot(s, _seat, rnd) {
    // Aims at the golden wedge's triple (or triple 20) and misses by a little, like a decent pub player.
    const [tx, ty] = tripleOf(ORDER[s.wedge] >= 10 ? s.wedge : 0);
    const spread = () => (rnd() + rnd() + rnd() - 1.5) * 0.17;
    return { x: tx + spread(), y: ty + spread() };
  },
};
