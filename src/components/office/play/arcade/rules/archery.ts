import type { Rules } from './types';
import { rng } from '../kit/rng';

// Sky Archer. Four rounds of three arrows each; the highest total wins. The shooting itself (aim, draw,
// wind, moving targets) happens on the shooter's device; a move reports what the arrow hit, and these
// rules keep the score, the turns and the wind for the next arrow.

export const ROUNDS = 4, ARROWS = 3;
export type Hit = 'target' | 'balloon' | 'apple' | 'miss';
export interface Shot { seat: number; what: Hit; pts: number; x: number; y: number }
export interface ArcheryState { scores: number[]; turn: number; first: number; left: number; round: number; wind: number; seed: number; n: number; last: Shot | null }
export interface ArcheryMove { what: Hit; pts: number; x: number; y: number } // x, y: where it struck, 0–1 of the range (for the others' screens)

export const POINTS = { balloon: 6, apple: 15 } as const;
const windFor = (seed: number, n: number) => Math.round((rng(seed * 13 + n * 7919 + 1)() * 2 - 1) * 100) / 100;

export const rules: Rules<ArcheryState, ArcheryMove> = {
  players: [2, 4],
  init: (n, seed, first) => ({ scores: new Array(n).fill(0), turn: first % n, first: first % n, left: ARROWS, round: 0, wind: windFor(seed, 0), seed, n: 0, last: null }),
  turn: (s) => (s.round >= ROUNDS ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || s.round >= ROUNDS || !m) return null;
    const pts = m.what === 'target' ? m.pts : m.what === 'balloon' ? POINTS.balloon : m.what === 'apple' ? POINTS.apple : m.what === 'miss' ? 0 : -1;
    if (!Number.isInteger(pts) || pts < 0 || (m.what === 'target' && (pts < 1 || pts > 10))) return null;
    const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5);
    const scores = s.scores.map((v, i) => (i === seat ? v + pts : v)), n = s.n + 1;
    const last = { seat, what: m.what, pts, x: clamp(m.x), y: clamp(m.y) };
    if (s.left > 1) return { ...s, scores, left: s.left - 1, n, wind: windFor(s.seed, n), last };
    const turn = (seat + 1) % s.scores.length;
    return { ...s, scores, turn, left: ARROWS, round: s.round + (turn === s.first ? 1 : 0), n, wind: windFor(s.seed, n), last };
  },
  result(s) {
    if (s.round < ROUNDS) return null;
    const top = Math.max(...s.scores);
    return { winners: s.scores.flatMap((v, i) => (v === top ? [i] : [])), scores: s.scores };
  },
  bot(_s, _seat, rnd) {
    const k = rnd(), x = 0.3 + rnd() * 0.4, y = 0.3 + rnd() * 0.3;
    if (k < 0.12) return { what: 'miss', pts: 0, x, y };
    if (k < 0.22) return { what: 'balloon', pts: POINTS.balloon, x, y };
    if (k < 0.25) return { what: 'apple', pts: POINTS.apple, x, y };
    return { what: 'target', pts: Math.max(1, Math.min(10, Math.round(7 + (rnd() + rnd() - 1) * 3.4))), x, y };
  },
};
