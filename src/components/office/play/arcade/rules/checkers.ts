import type { Rules } from './types';

// Checkers (English draughts) on the dark squares of an 8×8 board. Men move one square diagonally
// forward and capture by jumping; a capture is compulsory and a multi-jump must be finished with the
// same piece. A man reaching the far row is crowned (which ends the move) and may then move and capture
// backwards too. A player with no move loses; 80 moves without a capture or a man's move is a draw.

export interface CheckersState { b: number[]; turn: number; chain: number; quiet: number; last: [number, number] | null }
export interface CheckersMove { from: number; to: number }
// Pieces: 1 man / 2 king of seat 0 (moves up the board, towards row 0), 3 man / 4 king of seat 1.
const owner = (p: number) => (p === 0 ? -1 : p <= 2 ? 0 : 1);
const king = (p: number) => p === 2 || p === 4;
const QUIET_LIMIT = 80;

export interface Step extends CheckersMove { over: number } // over: the jumped square, or -1
function stepsOf(b: number[], from: number, jumpsOnly: boolean): Step[] {
  const p = b[from], seat = owner(p), out: Step[] = [];
  if (seat < 0) return out;
  const x = from % 8, y = Math.floor(from / 8);
  const rows = king(p) ? [-1, 1] : seat === 0 ? [-1] : [1];
  for (const dy of rows) for (const dx of [-1, 1]) {
    const x1 = x + dx, y1 = y + dy;
    if (x1 < 0 || x1 > 7 || y1 < 0 || y1 > 7) continue;
    const mid = y1 * 8 + x1;
    if (!b[mid]) { if (!jumpsOnly) out.push({ from, to: mid, over: -1 }); continue; }
    const x2 = x + dx * 2, y2 = y + dy * 2;
    if (owner(b[mid]) !== seat && x2 >= 0 && x2 <= 7 && y2 >= 0 && y2 <= 7 && !b[y2 * 8 + x2]) out.push({ from, to: y2 * 8 + x2, over: mid });
  }
  return out;
}
/** Every legal step for the player to move (jumps only, when any jump exists). */
export function legal(s: Pick<CheckersState, 'b' | 'turn' | 'chain'>): Step[] {
  if (s.chain >= 0) return stepsOf(s.b, s.chain, true).filter((m) => m.over >= 0);
  const all: Step[] = [];
  for (let i = 0; i < 64; i++) if (owner(s.b[i]) === s.turn) all.push(...stepsOf(s.b, i, false));
  const jumps = all.filter((m) => m.over >= 0);
  return jumps.length ? jumps : all;
}
function step(s: CheckersState, m: Step): CheckersState {
  const b = s.b.slice(), p = b[m.from], seat = owner(p);
  b[m.from] = 0;
  if (m.over >= 0) b[m.over] = 0;
  const row = Math.floor(m.to / 8), crowned = !king(p) && row === (seat === 0 ? 0 : 7);
  b[m.to] = crowned ? p + 1 : p;
  const more = m.over >= 0 && !crowned && stepsOf(b, m.to, true).some((x) => x.over >= 0);
  return { b, turn: more ? seat : 1 - seat, chain: more ? m.to : -1, quiet: m.over >= 0 || !king(p) ? 0 : s.quiet + 1, last: [m.from, m.to] };
}

function evaluate(b: number[], me: number) {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const seat = owner(p), row = Math.floor(i / 8), col = i % 8;
    const adv = seat === 0 ? 7 - row : row;
    let w = king(p) ? 175 : 100 + adv * 6 + ((seat === 0 ? row === 7 : row === 0) ? 12 : 0);
    if (col > 1 && col < 6 && row > 1 && row < 6) w += 4;
    v += seat === me ? w : -w;
  }
  return v;
}
function search(s: CheckersState, me: number, depth: number, alpha: number, beta: number): number {
  const ms = legal(s);
  if (!ms.length) return s.turn === me ? -100000 - depth : 100000 + depth;
  if (depth <= 0 && s.chain < 0) return evaluate(s.b, me);
  const maxing = s.turn === me;
  let best = maxing ? -Infinity : Infinity;
  for (const m of ms) {
    const next = step(s, m);
    const v = search(next, me, next.turn === s.turn ? depth : depth - 1, alpha, beta);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return best;
}

export const rules: Rules<CheckersState, CheckersMove> = {
  players: [2, 2],
  init(_n, _seed, first) {
    const b = new Array(64).fill(0);
    for (let i = 0; i < 64; i++) { const r = Math.floor(i / 8); if ((r + (i % 8)) % 2 === 1) b[i] = r < 3 ? 3 : r > 4 ? 1 : 0; }
    return { b, turn: first % 2, chain: -1, quiet: 0, last: null };
  },
  turn: (s) => (s.quiet >= QUIET_LIMIT || !legal(s).length ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || s.quiet >= QUIET_LIMIT || !m) return null;
    const found = legal(s).find((x) => x.from === m.from && x.to === m.to);
    return found ? step(s, found) : null;
  },
  result(s) {
    if (s.quiet >= QUIET_LIMIT) return { winners: [] };
    return legal(s).length ? null : { winners: [1 - s.turn] };
  },
  bot(s, seat, rnd) {
    const ms = legal(s);
    let best = -Infinity, picks: Step[] = [];
    for (const m of ms) {
      const next = step(s, m);
      const v = search(next, seat, next.turn === seat ? 5 : 4, -Infinity, Infinity);
      if (v > best + 2) { best = v; picks = [m]; } else if (Math.abs(v - best) <= 2) picks.push(m);
    }
    const m = picks[Math.floor(rnd() * picks.length)] ?? ms[0];
    return { from: m.from, to: m.to };
  },
};
export const pieceOwner = owner, isKing = king;
