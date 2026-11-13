import type { Rules } from './types';

// Four in a Row: 7 columns, 6 rows; a disc falls to the lowest free cell of its column. Four in a line
// (across, down or diagonally) wins; a full board is a draw.

export const COLS = 7, ROWS = 6;
export interface FourState { b: number[]; turn: number; last: number; line: number[] | null; moves: number }
export type FourMove = number; // the column

const LINES: number[][] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
  const cells = [0, 1, 2, 3].map((i) => [c + dc * i, r + dr * i]);
  if (cells.every(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS)) LINES.push(cells.map(([x, y]) => y * COLS + x));
}
const lineOf = (b: number[]) => LINES.find((l) => b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]] && b[l[2]] === b[l[3]]) ?? null;
/** The cell a disc dropped into `col` lands in, or -1 when the column is full (row 0 is the top). */
export function landing(b: number[], col: number) { for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + col]) return r * COLS + col; return -1; }

// How good the board is for `me` (1 or 2): open twos and threes count, the centre column a little.
function evaluate(b: number[], me: number) {
  let v = 0;
  for (const l of LINES) {
    let mine = 0, theirs = 0;
    for (const i of l) { if (b[i] === me) mine++; else if (b[i]) theirs++; }
    if (mine && theirs) continue;
    v += mine === 3 ? 50 : mine === 2 ? 8 : mine === 1 ? 1 : 0;
    v -= theirs === 3 ? 60 : theirs === 2 ? 8 : theirs === 1 ? 1 : 0;
  }
  for (let r = 0; r < ROWS; r++) if (b[r * COLS + 3] === me) v += 4;
  return v;
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function search(b: number[], player: number, me: number, depth: number, alpha: number, beta: number): number {
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    const i = landing(b, c);
    if (i < 0) continue;
    any = true;
    b[i] = player;
    const v = lineOf(b) ? 100000 + depth : depth === 0 ? (player === me ? 1 : -1) * evaluate(b, me) : -search(b, 3 - player, me, depth - 1, -beta, -alpha);
    b[i] = 0;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}

export const rules: Rules<FourState, FourMove> = {
  players: [2, 2],
  init: (_n, _seed, first) => ({ b: new Array(COLS * ROWS).fill(0), turn: first % 2, last: -1, line: null, moves: 0 }),
  turn: (s) => (s.line || s.moves >= COLS * ROWS ? -1 : s.turn),
  apply(s, seat, col) {
    if (seat !== s.turn || s.line || !Number.isInteger(col) || col < 0 || col >= COLS) return null;
    const i = landing(s.b, col);
    if (i < 0) return null;
    const b = s.b.slice();
    b[i] = seat + 1;
    return { b, turn: 1 - seat, last: i, line: lineOf(b), moves: s.moves + 1 };
  },
  result: (s) => (s.line ? { winners: [s.b[s.line[0]] - 1] } : s.moves >= COLS * ROWS ? { winners: [] } : null),
  bot(s, seat, rnd) {
    const me = seat + 1, b = s.b.slice();
    let best = -Infinity, picks: number[] = [];
    for (const c of ORDER) {
      const i = landing(b, c);
      if (i < 0) continue;
      b[i] = me;
      const v = lineOf(b) ? 1e6 : -search(b, 3 - me, me, 4, -Infinity, Infinity);
      b[i] = 0;
      if (v > best + 0.5) { best = v; picks = [c]; } else if (Math.abs(v - best) <= 0.5) picks.push(c);
    }
    return picks[Math.floor(rnd() * picks.length)] ?? ORDER.find((c) => landing(b, c) >= 0) ?? 0;
  },
};
