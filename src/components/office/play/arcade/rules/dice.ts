import type { Rules } from './types';
import { rng } from '../kit/rng';

// Dice 10,000. On a turn: roll the six dice, set aside at least one scoring die, then either roll the
// remaining dice again or bank the turn's points. A roll with nothing to score loses the turn's points.
// Setting aside all six gives a fresh roll of six. First to bank 5,000 wins.
//   1 = 100, 5 = 50; three of a kind = face × 100 (three 1s = 1,000), doubled for every extra die of
//   that face; 1-2-3-4-5-6 = 1,500; three pairs = 750.

export const TARGET = 5000;
export interface DiceState {
  scores: number[]; turn: number;
  dice: number[]; // the dice just rolled (to choose from); empty before a roll
  free: number; // how many dice the next roll uses
  pot: number; // points collected this turn, not banked yet
  seed: number; n: number;
  bust: { seat: number; dice: number[]; lost: number } | null; // the last turn ended in a bust (for showing)
  hot: boolean; // all six were set aside: a fresh roll of six
}
export type DiceMove = { t: 'roll' } | { t: 'keep'; idx: number[]; bank: boolean };

/** The score of a set of dice when every die of it counts, else 0. */
export function scoreOf(values: number[]): number {
  if (!values.length) return 0;
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) c[v]++;
  if (values.length === 6) {
    if (c.slice(1).every((n) => n === 1)) return 1500;
    if (c.slice(1).filter((n) => n === 2).length === 3) return 750;
  }
  let score = 0;
  for (let f = 1; f <= 6; f++) {
    let n = c[f];
    if (n >= 3) { score += (f === 1 ? 1000 : f * 100) * 2 ** (n - 3); n = 0; }
    if (n && f !== 1 && f !== 5) return 0;
    score += n * (f === 1 ? 100 : f === 5 ? 50 : 0);
  }
  return score;
}
/** Whether a roll has anything to set aside. */
export function scores(values: number[]): boolean {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) c[v]++;
  return c[1] > 0 || c[5] > 0 || c.some((n) => n >= 3) || scoreOf(values) > 0;
}
const throwDice = (seed: number, n: number, count: number) => { const r = rng(seed * 131 + n * 7919 + 5); return Array.from({ length: count }, () => 1 + Math.floor(r() * 6)); };
const nextSeat = (s: DiceState) => (s.turn + 1) % s.scores.length;

export const rules: Rules<DiceState, DiceMove> = {
  players: [2, 4],
  init: (n, seed, first) => ({ scores: new Array(n).fill(0), turn: first % n, dice: [], free: 6, pot: 0, seed, n: 0, bust: null, hot: false }),
  turn: (s) => (s.scores.some((v) => v >= TARGET) ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || !m || s.scores.some((v) => v >= TARGET)) return null;
    if (m.t === 'roll') {
      if (s.dice.length) return null;
      const dice = throwDice(s.seed, s.n + 1, s.free);
      if (!scores(dice)) return { ...s, turn: nextSeat(s), dice: [], free: 6, pot: 0, n: s.n + 1, bust: { seat, dice, lost: s.pot }, hot: false };
      return { ...s, dice, n: s.n + 1, bust: null, hot: false };
    }
    if (m.t !== 'keep' || !s.dice.length || !Array.isArray(m.idx) || !m.idx.length) return null;
    const idx = [...new Set(m.idx)];
    if (idx.length !== m.idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= s.dice.length)) return null;
    const gain = scoreOf(idx.map((i) => s.dice[i]));
    if (!gain) return null;
    const pot = s.pot + gain, left = s.dice.length - idx.length;
    if (m.bank) {
      const total = s.scores.map((v, i) => (i === seat ? v + pot : v));
      return { ...s, scores: total, turn: total[seat] >= TARGET ? seat : nextSeat(s), dice: [], free: 6, pot: 0, bust: null, hot: false };
    }
    return { ...s, dice: [], free: left || 6, pot, bust: null, hot: left === 0 };
  },
  result(s) {
    const top = Math.max(...s.scores);
    return top >= TARGET ? { winners: s.scores.flatMap((v, i) => (v === top ? [i] : [])), scores: s.scores } : null;
  },
  bot(s, seat) {
    if (!s.dice.length) return { t: 'roll' };
    // The best-paying set to put aside; with little at stake, keep fewer dice to roll more.
    let best: number[] = [], bestValue = -1;
    for (let mask = 1; mask < 1 << s.dice.length; mask++) {
      const idx = s.dice.flatMap((_, i) => (mask & (1 << i) ? [i] : []));
      const gain = scoreOf(idx.map((i) => s.dice[i]));
      if (!gain) continue;
      const left = s.dice.length - idx.length || 6;
      const value = gain + left * 28;
      if (value > bestValue) { bestValue = value; best = idx; }
    }
    const pot = s.pot + scoreOf(best.map((i) => s.dice[i])), left = s.dice.length - best.length || 6;
    const wins = s.scores[seat] + pot >= TARGET;
    const behind = Math.max(...s.scores) - s.scores[seat] > 1500;
    const bank = wins || (left <= 2 && pot >= (behind ? 350 : 250)) || (left === 3 && pot >= (behind ? 600 : 400)) || (left >= 4 && left < 6 && pot >= (behind ? 1400 : 900)) || (left === 6 && pot >= 2000);
    return { t: 'keep', idx: best, bank };
  },
};
