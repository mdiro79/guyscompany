import type { Rnd } from '../kit/rng';

// A turn-based game as pure functions over a plain state (it travels between browsers as JSON).
// The same rules run for people and for the computer, on every device at the table.

export interface Outcome { winners: number[]; scores?: number[] } // no winners: a draw

export interface Rules<S, M> {
  /** How many can play: [fewest, most]. */
  players: [number, number];
  /** A fresh position for `n` players; `first` moves first. */
  init(n: number, seed: number, first: number): S;
  /** The seat to move, or -1 when the game is over. */
  turn(s: S): number;
  /** The position after `seat` plays `m`, or null when that is not allowed. Never changes `s`. */
  apply(s: S, seat: number, m: M): S | null;
  /** The result once the game is over, else null. */
  result(s: S): Outcome | null;
  /** The computer's move for `seat` (always a legal one). */
  bot(s: S, seat: number, rnd: Rnd): M;
}

/** What a game's board gets to show a match and to make moves. */
export interface BoardProps<S, M> {
  s: S;
  seat: number; // the seat this device looks from (the one to move, when that is a player here)
  canMove: boolean; // it is this device's turn
  move(m: M): void;
  names: string[]; // per seat
  colors: string[]; // per seat
  phone: boolean; rtl: boolean;
  t(key: string, values?: Record<string, string | number>): string;
}

export const SEAT_COLORS = ['#ff9a4d', '#4fd8cf', '#ffd23f', '#c89bff'];

/** Plays a whole game with the computer on every seat (used by the tests). Returns the final state. */
export function playout<S, M>(rules: Rules<S, M>, n: number, seed: number, rnd: Rnd, maxMoves = 5000): { s: S; moves: number } {
  let s = rules.init(n, seed, 0), moves = 0;
  for (;;) {
    const seat = rules.turn(s);
    if (seat < 0) break;
    if (++moves > maxMoves) throw new Error('game does not end');
    const next = rules.apply(s, seat, rules.bot(s, seat, rnd));
    if (!next) throw new Error(`computer made an illegal move at move ${moves}`);
    s = next;
  }
  if (!rules.result(s)) throw new Error('over without a result');
  return { s, moves };
}
