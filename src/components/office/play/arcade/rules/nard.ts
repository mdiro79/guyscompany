import type { Rules } from './types';
import { rng } from '../kit/rng';

// Backgammon. 24 points, 15 checkers a side, two dice (a double is played four times). A point with two
// or more enemy checkers is closed; a single enemy checker is hit and must re-enter from the bar in the
// opponent's home before anything else moves. With all 15 checkers in the home board they are borne off;
// the first to bear off all wins. As many dice as possible must be played (and the larger one when only
// one of the two can be).
//
// Points are counted from each player's own side: a checker travels from 23 down to 0, its home is
// 0–5, the bar is 24 and "off" is below 0. Seat 0's point i is the board's point i; seat 1's is 23 - i.

export interface NardState {
  p: number[]; // board points: > 0 seat 0's checkers, < 0 seat 1's
  bar: [number, number]; off: [number, number];
  turn: number; dice: number[]; // dice still to play this turn
  roll: [number, number]; // the roll as thrown (for showing)
  seed: number; n: number; // dice come from the seed, so every device throws the same
  skipped: number; // how many players in a row had no move before this turn (for a note)
  last: { seat: number; from: number; to: number; hit: boolean } | null;
}
export interface NardMove { from: number; die: number } // from: own point 0–23, or 24 for the bar
export const BAR = 24;

const at = (seat: number, i: number) => (seat === 0 ? i : 23 - i);
export const mine = (s: Pick<NardState, 'p'>, seat: number, i: number) => { const v = s.p[at(seat, i)]; return seat === 0 ? Math.max(0, v) : Math.max(0, -v); };
const theirs = (s: Pick<NardState, 'p'>, seat: number, i: number) => { const v = s.p[at(seat, i)]; return seat === 0 ? Math.max(0, -v) : Math.max(0, v); };
type Pos = Pick<NardState, 'p' | 'bar' | 'off'>;

function allHome(s: Pos, seat: number) {
  if (s.bar[seat]) return false;
  for (let i = 6; i < 24; i++) if (mine(s, seat, i)) return false;
  return true;
}
/** Whether `seat` may play `die` from `from` in this position (ignoring the "use most dice" rule). */
export function canPlay(s: Pos, seat: number, from: number, die: number): boolean {
  if (s.bar[seat] ? from !== BAR : from === BAR || !mine(s, seat, from)) return false;
  const to = from - die;
  if (to >= 0) return theirs(s, seat, to) < 2;
  if (!allHome(s, seat)) return false;
  if (to === -1) return true;
  // A die larger than needed bears off only the rearmost checker.
  for (let i = from + 1; i < 6; i++) if (mine(s, seat, i)) return false;
  return true;
}
function play(s: Pos, seat: number, from: number, die: number): Pos & { hit: boolean; to: number } {
  const p = s.p.slice(), bar: [number, number] = [s.bar[0], s.bar[1]], off: [number, number] = [s.off[0], s.off[1]], sign = seat === 0 ? 1 : -1;
  if (from === BAR) bar[seat]--; else p[at(seat, from)] -= sign;
  const to = from - die;
  let hit = false;
  if (to < 0) off[seat]++;
  else {
    const j = at(seat, to);
    if (p[j] === -sign) { p[j] = 0; bar[1 - seat]++; hit = true; }
    p[j] += sign;
  }
  return { p, bar, off, hit, to };
}
const sources = (s: Pos, seat: number) => { if (s.bar[seat]) return [BAR]; const out: number[] = []; for (let i = 0; i < 24; i++) if (mine(s, seat, i)) out.push(i); return out; };
/** The most dice of `dice` that can be played from here. */
function most(s: Pos, seat: number, dice: number[]): number {
  if (!dice.length) return 0;
  let best = 0;
  const tried = new Set<number>();
  for (let k = 0; k < dice.length && best < dice.length; k++) {
    const die = dice[k];
    if (tried.has(die)) continue;
    tried.add(die);
    const rest = dice.slice(0, k).concat(dice.slice(k + 1));
    for (const from of sources(s, seat)) {
      if (!canPlay(s, seat, from, die)) continue;
      best = Math.max(best, 1 + most(play(s, seat, from, die), seat, rest));
      if (best === dice.length) break;
    }
  }
  return best;
}
/** The legal single moves right now, honouring "play as many dice as possible, and the larger if only one". */
export function legal(s: Pick<NardState, 'p' | 'bar' | 'off' | 'turn' | 'dice'>): NardMove[] {
  const seat = s.turn, total = most(s, seat, s.dice), out: NardMove[] = [];
  if (!total) return out;
  for (const die of new Set(s.dice)) {
    const k = s.dice.indexOf(die), rest = s.dice.slice(0, k).concat(s.dice.slice(k + 1));
    for (const from of sources(s, seat)) if (canPlay(s, seat, from, die) && 1 + most(play(s, seat, from, die), seat, rest) === total) out.push({ from, die });
  }
  if (total === 1 && new Set(out.map((m) => m.die)).size > 1) { const big = Math.max(...out.map((m) => m.die)); return out.filter((m) => m.die === big); }
  return out;
}

function throwDice(seed: number, n: number): [number, number] { const r = rng(seed * 31 + n * 7919 + 17); return [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]; }
// The next player rolls; anyone who cannot move at all is skipped straight away.
function nextTurn(s: NardState, from: number): NardState {
  let turn = from, n = s.n, skipped = 0;
  for (let guard = 0; guard < 60; guard++) {
    turn = 1 - turn; n++;
    const roll = throwDice(s.seed, n), dice = roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]];
    const next = { ...s, turn, dice, roll, n, skipped };
    if (legal(next).length) return next;
    skipped++;
  }
  return { ...s, turn, n, dice: [], skipped };
}

export const pips = (s: Pos, seat: number) => { let v = s.bar[seat] * 25; for (let i = 0; i < 24; i++) v += mine(s, seat, i) * (i + 1); return v; };
function evaluate(s: Pos, seat: number) {
  const other = 1 - seat;
  let v = (pips(s, other) - pips(s, seat)) * 1.0 + s.off[seat] * 12 + s.bar[other] * 14;
  // Far apart with no contact left: it is only a race.
  let contact = s.bar[0] + s.bar[1] > 0, back = -1;
  for (let i = 23; i >= 0 && back < 0; i--) if (mine(s, seat, i)) back = i;
  for (let i = 0; i <= back && !contact; i++) if (theirs(s, seat, i)) contact = true;
  if (!contact) return v;
  for (let i = 0; i < 24; i++) {
    const m = mine(s, seat, i);
    if (m === 1) {
      // A lone checker is in danger from enemy checkers that still have to pass it.
      let danger = 0;
      for (let j = i + 1; j < 24 && j <= i + 12; j++) if (theirs(s, seat, j)) danger += j - i <= 6 ? 1 : 0.4;
      if (s.bar[other]) danger += i >= 18 ? 1 : 0;
      v -= Math.min(3, danger) * (6 + (23 - i) * 0.35);
    } else if (m >= 2) v += i < 6 ? 6 : i < 12 ? 4 : 2; // a made point (best in and near home)
    if (m > 4) v -= (m - 4) * 2;
  }
  return v;
}
// Every way to finish the turn from here: the first move of each line and the position it ends in.
function lines(s: NardState, first: NardMove | null, out: { first: NardMove; end: Pos }[], seen: Set<string>) {
  const ms = legal(s);
  if (!ms.length) { if (first) { const key = `${s.p}|${s.bar}|${s.off}`; if (!seen.has(key)) { seen.add(key); out.push({ first, end: s }); } } return; }
  for (const m of ms) {
    const k = s.dice.indexOf(m.die);
    lines({ ...s, ...play(s, s.turn, m.from, m.die), dice: s.dice.slice(0, k).concat(s.dice.slice(k + 1)) }, first ?? m, out, seen);
    if (out.length > 700) return;
  }
}

export const rules: Rules<NardState, NardMove> = {
  players: [2, 2],
  init(_n, seed, first) {
    const p = new Array(24).fill(0);
    for (const [i, c] of [[23, 2], [12, 5], [7, 3], [5, 5]]) { p[i] += c; p[23 - i] -= c; }
    const base: NardState = { p, bar: [0, 0], off: [0, 0], turn: 1 - (first % 2), dice: [], roll: [1, 1], seed, n: 0, skipped: 0, last: null };
    return nextTurn(base, base.turn);
  },
  turn: (s) => (s.off[0] >= 15 || s.off[1] >= 15 || !s.dice.length ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || !m || s.off[0] >= 15 || s.off[1] >= 15) return null;
    if (!legal(s).some((x) => x.from === m.from && x.die === m.die)) return null;
    const moved = play(s, seat, m.from, m.die), k = s.dice.indexOf(m.die);
    const next: NardState = { ...s, p: moved.p, bar: moved.bar, off: moved.off, dice: s.dice.slice(0, k).concat(s.dice.slice(k + 1)), skipped: 0, last: { seat, from: m.from, to: moved.to, hit: moved.hit } };
    if (next.off[seat] >= 15) return { ...next, dice: [] };
    return next.dice.length && legal(next).length ? next : nextTurn(next, seat);
  },
  result: (s) => (s.off[0] >= 15 ? { winners: [0] } : s.off[1] >= 15 ? { winners: [1] } : !s.dice.length ? { winners: [] } : null),
  bot(s, seat, rnd) {
    const out: { first: NardMove; end: Pos }[] = [];
    lines(s, null, out, new Set());
    let best = -Infinity, pick: NardMove | null = null;
    for (const l of out) { const v = evaluate(l.end, seat) + rnd() * 0.5; if (v > best) { best = v; pick = l.first; } }
    return pick ?? legal(s)[0];
  },
};
