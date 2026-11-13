import type { Rules } from './types';

// Reversi on an 8×8 board. A move must trap at least one enemy disc in a straight line between the new
// disc and another of one's own; trapped discs flip. A player with no move is skipped; when neither can
// move the game is over and the larger count wins.

export const N = 8;
export interface ReversiState { b: number[]; turn: number; last: number; skipped: boolean; over: boolean }
export type ReversiMove = number; // the cell

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The discs that placing `me` (1 or 2) on `cell` would flip (empty: not a legal move). */
export function flips(b: number[], cell: number, me: number): number[] {
  if (b[cell]) return [];
  const x0 = cell % N, y0 = Math.floor(cell / N), out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const line: number[] = [];
    let x = x0 + dx, y = y0 + dy;
    while (x >= 0 && x < N && y >= 0 && y < N && b[y * N + x] === 3 - me) { line.push(y * N + x); x += dx; y += dy; }
    if (line.length && x >= 0 && x < N && y >= 0 && y < N && b[y * N + x] === me) out.push(...line);
  }
  return out;
}
export const movesFor = (b: number[], me: number) => { const m: number[] = []; for (let i = 0; i < N * N; i++) if (!b[i] && flips(b, i, me).length) m.push(i); return m; };
const count = (b: number[], me: number) => b.reduce((n, v) => n + (v === me ? 1 : 0), 0);

// Corners are gold, the squares next to them are traps, edges are good.
const WEIGHT = [
  120, -20, 20, 5, 5, 20, -20, 120, -20, -40, -5, -5, -5, -5, -40, -20, 20, -5, 15, 3, 3, 15, -5, 20, 5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5, 20, -5, 15, 3, 3, 15, -5, 20, -20, -40, -5, -5, -5, -5, -40, -20, 120, -20, 20, 5, 5, 20, -20, 120,
];
function evaluate(b: number[], me: number) {
  let v = 0, empty = 0;
  for (let i = 0; i < 64; i++) { if (b[i] === me) v += WEIGHT[i]; else if (b[i]) v -= WEIGHT[i]; else empty++; }
  if (empty < 12) return (count(b, me) - count(b, 3 - me)) * 30 + v * 0.2;
  return v + (movesFor(b, me).length - movesFor(b, 3 - me).length) * 6;
}
function play(b: number[], cell: number, me: number) { const n = b.slice(); n[cell] = me; for (const f of flips(b, cell, me)) n[f] = me; return n; }
function search(b: number[], player: number, me: number, depth: number, alpha: number, beta: number, passed: boolean): number {
  const ms = movesFor(b, player);
  if (!ms.length) {
    if (passed) return (count(b, me) - count(b, 3 - me)) * 1000 * (player === me ? 1 : -1);
    return -search(b, 3 - player, me, depth, -beta, -alpha, true);
  }
  if (depth === 0) return (player === me ? 1 : -1) * evaluate(b, me);
  let best = -Infinity;
  for (const m of ms) {
    const v = -search(play(b, m, player), 3 - player, me, depth - 1, -beta, -alpha, false);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export const rules: Rules<ReversiState, ReversiMove> = {
  players: [2, 2],
  init(_n, _seed, first) {
    const b = new Array(64).fill(0);
    b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2;
    return { b, turn: first % 2, last: -1, skipped: false, over: false };
  },
  turn: (s) => (s.over ? -1 : s.turn),
  apply(s, seat, cell) {
    if (s.over || seat !== s.turn || !Number.isInteger(cell) || cell < 0 || cell >= 64 || !flips(s.b, cell, seat + 1).length) return null;
    const b = play(s.b, cell, seat + 1);
    const other = 1 - seat;
    if (movesFor(b, other + 1).length) return { b, turn: other, last: cell, skipped: false, over: false };
    if (movesFor(b, seat + 1).length) return { b, turn: seat, last: cell, skipped: true, over: false };
    return { b, turn: seat, last: cell, skipped: false, over: true };
  },
  result(s) {
    if (!s.over) return null;
    const a = count(s.b, 1), c = count(s.b, 2);
    return { winners: a === c ? [] : [a > c ? 0 : 1], scores: [a, c] };
  },
  bot(s, seat, rnd) {
    const me = seat + 1, ms = movesFor(s.b, me);
    let best = -Infinity, picks: number[] = [];
    for (const m of ms) {
      const v = -search(play(s.b, m, me), 3 - me, me, 3, -Infinity, Infinity, false);
      if (v > best + 1) { best = v; picks = [m]; } else if (Math.abs(v - best) <= 1) picks.push(m);
    }
    return picks[Math.floor(rnd() * picks.length)] ?? ms[0] ?? 0;
  },
};
export const counts = (b: number[]) => [count(b, 1), count(b, 2)];
