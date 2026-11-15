// Chess rules for the café's chess table: every move by the rules (castling, en passant, promotion), check,
// checkmate, stalemate and the usual draws (fifty moves, too little material, threefold repetition), and a
// small computer player. Pure functions, shared by both players' devices and the tests.
//
// Squares are 0…63: index = rank * 8 + file, a1 = 0, h1 = 7, a8 = 56. Pieces are letters: white upper case
// (P N B R Q K), black lower case, '' for an empty square.

export type Color = 'w' | 'b';
export type Piece = '' | 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Move { from: number; to: number; promo?: 'q' | 'r' | 'b' | 'n' }
export interface Position {
  board: Piece[]; turn: Color;
  castle: string; // which of K Q k q are still allowed
  ep: number; // square a pawn may capture into en passant, -1 if none
  half: number; // moves since the last capture or pawn move (fifty-move rule)
  full: number; // move number
}
export type Result = { winner: Color | null; reason: 'mate' | 'stalemate' | 'fifty' | 'material' | 'repetition' | 'resign' };

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const colorOf = (p: Piece): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b');
export const kindOf = (p: Piece) => p.toLowerCase() as '' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 3;
export const sqName = (sq: number) => 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);

export function fromFen(fen: string): Position {
  const [rows, turn, castle, ep, half, full] = fen.split(' ');
  const board: Piece[] = Array(64).fill('');
  rows.split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else { board[(7 - i) * 8 + f] = ch as Piece; f++; }
    }
  });
  const epSq = ep && ep !== '-' ? (Number(ep[1]) - 1) * 8 + 'abcdefgh'.indexOf(ep[0]) : -1;
  return { board, turn: turn === 'b' ? 'b' : 'w', castle: castle === '-' ? '' : castle, ep: epSq, half: Number(half) || 0, full: Number(full) || 1 };
}
export const startPosition = () => fromFen(START);

/** The position as text without the move counters (for repetition). */
export function key(p: Position) {
  let s = '';
  for (let r = 7; r >= 0; r--) { for (let f = 0; f < 8; f++) s += p.board[r * 8 + f] || '.'; s += '/'; }
  return `${s} ${p.turn} ${p.castle} ${p.ep}`;
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const at = (f: number, r: number) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1);

/** Whether `sq` is attacked by side `by`. */
export function attacked(board: Piece[], sq: number, by: Color): boolean {
  const f = fileOf(sq), r = rankOf(sq), up = by === 'w' ? 1 : -1;
  const P = by === 'w' ? 'P' : 'p', N = by === 'w' ? 'N' : 'n', B = by === 'w' ? 'B' : 'b', R = by === 'w' ? 'R' : 'r', Q = by === 'w' ? 'Q' : 'q', K = by === 'w' ? 'K' : 'k';
  for (const df of [-1, 1]) { const s = at(f + df, r - up); if (s >= 0 && board[s] === P) return true; }
  for (const [df, dr] of KNIGHT) { const s = at(f + df, r + dr); if (s >= 0 && board[s] === N) return true; }
  for (const [df, dr] of KING) { const s = at(f + df, r + dr); if (s >= 0 && board[s] === K) return true; }
  for (const [dirs, a, b] of [[ROOK, R, Q], [BISHOP, B, Q]] as const) {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) {
        const s = at(f + df * k, r + dr * k);
        if (s < 0) break;
        const p = board[s];
        if (!p) continue;
        if (p === a || p === b) return true;
        break;
      }
    }
  }
  return false;
}

export const kingSquare = (board: Piece[], c: Color) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (p: Position, c: Color = p.turn) => attacked(p.board, kingSquare(p.board, c), c === 'w' ? 'b' : 'w');

/** Moves by the piece rules, not yet checked for leaving one's own king in check. */
function pseudo(p: Position): Move[] {
  const out: Move[] = [], me = p.turn, them = me === 'w' ? 'b' : 'w', b = p.board;
  for (let sq = 0; sq < 64; sq++) {
    const pc = b[sq];
    if (!pc || colorOf(pc) !== me) continue;
    const f = fileOf(sq), r = rankOf(sq), k = kindOf(pc);
    const add = (to: number) => {
      if (k === 'p' && (rankOf(to) === 7 || rankOf(to) === 0)) for (const promo of ['q', 'r', 'b', 'n'] as const) out.push({ from: sq, to, promo });
      else out.push({ from: sq, to });
    };
    if (k === 'p') {
      const up = me === 'w' ? 1 : -1, one = at(f, r + up);
      if (one >= 0 && !b[one]) {
        add(one);
        const two = at(f, r + 2 * up);
        if ((me === 'w' ? r === 1 : r === 6) && !b[two]) add(two);
      }
      for (const df of [-1, 1]) {
        const s = at(f + df, r + up);
        if (s < 0) continue;
        if ((b[s] && colorOf(b[s]) === them) || s === p.ep) add(s);
      }
    } else if (k === 'n' || k === 'k') {
      for (const [df, dr] of k === 'n' ? KNIGHT : KING) { const s = at(f + df, r + dr); if (s >= 0 && colorOf(b[s]) !== me) add(s); }
      if (k === 'k') {
        // Castling: rights kept, squares between empty, the king not in, through or into check.
        const home = me === 'w' ? 4 : 60;
        if (sq === home && !attacked(b, home, them)) {
          const [kSide, qSide] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
          if (p.castle.includes(kSide) && !b[home + 1] && !b[home + 2] && b[home + 3] === (me === 'w' ? 'R' : 'r') && !attacked(b, home + 1, them) && !attacked(b, home + 2, them)) out.push({ from: home, to: home + 2 });
          if (p.castle.includes(qSide) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (me === 'w' ? 'R' : 'r') && !attacked(b, home - 1, them) && !attacked(b, home - 2, them)) out.push({ from: home, to: home - 2 });
        }
      }
    } else {
      const dirs = k === 'r' ? ROOK : k === 'b' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [df, dr] of dirs) for (let n = 1; n < 8; n++) {
        const s = at(f + df * n, r + dr * n);
        if (s < 0) break;
        if (!b[s]) { add(s); continue; }
        if (colorOf(b[s]) === them) add(s);
        break;
      }
    }
  }
  return out;
}

/** The position after a move (assumed to be by the rules). */
export function apply(p: Position, m: Move): Position {
  const b = p.board.slice(), pc = b[m.from], k = kindOf(pc), me = p.turn;
  let captured = b[m.to] !== '';
  b[m.to] = m.promo ? ((me === 'w' ? m.promo.toUpperCase() : m.promo) as Piece) : pc;
  b[m.from] = '';
  if (k === 'p' && m.to === p.ep) { b[m.to + (me === 'w' ? -8 : 8)] = ''; captured = true; }
  if (k === 'k' && Math.abs(m.to - m.from) === 2) {
    // The rook jumps over the king.
    if (m.to > m.from) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; } else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
  }
  let castle = p.castle;
  const drop = (c: string) => { castle = castle.replace(c, ''); };
  if (pc === 'K') { drop('K'); drop('Q'); }
  if (pc === 'k') { drop('k'); drop('q'); }
  for (const [sq, c] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']] as const) if (m.from === sq || m.to === sq) drop(c);
  const ep = k === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return { board: b, turn: me === 'w' ? 'b' : 'w', castle, ep, half: k === 'p' || captured ? 0 : p.half + 1, full: p.full + (me === 'b' ? 1 : 0) };
}

/** Every move by the rules for the side to move. */
export function legalMoves(p: Position): Move[] {
  return pseudo(p).filter((m) => !inCheck(apply(p, m), p.turn));
}
export const sameMove = (a: Move, b: Move) => a.from === b.from && a.to === b.to && (a.promo ?? 'q') === (b.promo ?? 'q');

function lowMaterial(b: Piece[]) {
  const rest = b.filter((x) => x && kindOf(x) !== 'k');
  if (rest.length === 0) return true;
  if (rest.length === 1 && (kindOf(rest[0]) === 'n' || kindOf(rest[0]) === 'b')) return true;
  // Bishops only, all on squares of one colour.
  if (rest.every((x) => kindOf(x) === 'b')) {
    const shades = new Set(b.flatMap((x, sq) => (x && kindOf(x) === 'b' ? [(fileOf(sq) + rankOf(sq)) % 2] : [])));
    return shades.size === 1;
  }
  return false;
}

/** The end of the game in this position (with the earlier positions' keys for repetition), or null. */
export function resultOf(p: Position, history: string[] = []): Result | null {
  if (legalMoves(p).length === 0) return inCheck(p) ? { winner: p.turn === 'w' ? 'b' : 'w', reason: 'mate' } : { winner: null, reason: 'stalemate' };
  if (p.half >= 100) return { winner: null, reason: 'fifty' };
  if (lowMaterial(p.board)) return { winner: null, reason: 'material' };
  const k = key(p);
  if (history.filter((h) => h === k).length >= 2) return { winner: null, reason: 'repetition' };
  return null;
}

/** Standard notation for a move in a position (Nf3, exd5, O-O, e8=Q+, Qxf7#). */
export function san(p: Position, m: Move): string {
  const pc = p.board[m.from], k = kindOf(pc);
  let s: string;
  if (k === 'k' && Math.abs(m.to - m.from) === 2) s = m.to > m.from ? 'O-O' : 'O-O-O';
  else {
    const cap = p.board[m.to] !== '' || (k === 'p' && m.to === p.ep);
    if (k === 'p') s = (cap ? 'abcdefgh'[fileOf(m.from)] + 'x' : '') + sqName(m.to) + (m.promo ? `=${m.promo.toUpperCase()}` : '');
    else {
      const others = legalMoves(p).filter((o) => o.to === m.to && o.from !== m.from && p.board[o.from] === pc);
      let dis = '';
      if (others.length) {
        if (!others.some((o) => fileOf(o.from) === fileOf(m.from))) dis = 'abcdefgh'[fileOf(m.from)];
        else if (!others.some((o) => rankOf(o.from) === rankOf(m.from))) dis = String(rankOf(m.from) + 1);
        else dis = sqName(m.from);
      }
      s = k.toUpperCase() + dis + (cap ? 'x' : '') + sqName(m.to);
    }
  }
  const next = apply(p, m);
  if (inCheck(next)) s += legalMoves(next).length ? '+' : '#';
  return s;
}

/** Counts the positions reached after `depth` moves (to check the move rules against known numbers). */
export function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(p)) n += perft(apply(p, m), depth - 1);
  return n;
}

// ——— The computer player ———
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Small bonuses for good squares (from white's side, a1 first): pawns forward, knights and bishops central, kings safe early.
const CENTRE = Array.from({ length: 64 }, (_, sq) => { const f = fileOf(sq), r = rankOf(sq); return 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)); });
function squareBonus(pc: Piece, sq: number, endgame: boolean) {
  const k = kindOf(pc), white = colorOf(pc) === 'w', r = white ? rankOf(sq) : 7 - rankOf(sq), c = CENTRE[sq];
  switch (k) {
    case 'p': return r * 8 + (c >= 2.5 ? 10 : 0);
    case 'n': return c * 10 - 10;
    case 'b': return c * 6;
    case 'q': return c * 2;
    case 'r': return r === 6 ? 15 : 0;
    case 'k': return endgame ? c * 10 : (r === 0 ? 10 : -20) - c * 5;
    default: return 0;
  }
}
/** The position's value for the side to move (centipawns). */
export function evaluate(p: Position): number {
  let s = 0, heavy = 0;
  for (const pc of p.board) if (pc && (kindOf(pc) === 'q' || kindOf(pc) === 'r')) heavy++;
  const endgame = heavy <= 2;
  p.board.forEach((pc, sq) => {
    if (!pc) return;
    const v = VALUE[kindOf(pc)] + squareBonus(pc, sq, endgame);
    s += colorOf(pc) === 'w' ? v : -v;
  });
  return p.turn === 'w' ? s : -s;
}

function search(p: Position, depth: number, alpha: number, beta: number, budget: { n: number }): number {
  budget.n--;
  if (depth === 0 || budget.n <= 0) return evaluate(p);
  const moves = legalMoves(p);
  if (!moves.length) return inCheck(p) ? -100000 - depth : 0;
  // Captures first (bigger prey first) cut the search much shorter.
  moves.sort((a, b) => VALUE[kindOf(p.board[b.to])] - VALUE[kindOf(p.board[a.to])]);
  for (const m of moves) {
    const v = -search(apply(p, m), depth - 1, -beta, -alpha, budget);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

/** The computer's move: a short look ahead with a little randomness among equally good moves. */
export function bestMove(p: Position, depth = 3, rnd: () => number = Math.random): Move | null {
  const moves = legalMoves(p);
  if (!moves.length) return null;
  const budget = { n: 60000 };
  let best: Move[] = [], bestV = -Infinity;
  moves.sort((a, b) => VALUE[kindOf(p.board[b.to])] - VALUE[kindOf(p.board[a.to])]);
  for (const m of moves) {
    const v = -search(apply(p, m), depth - 1, -Infinity, -(bestV - 5), budget) + rnd() * 8;
    if (v > bestV + 4) { bestV = v; best = [m]; } else if (v > bestV - 4) best.push(m);
  }
  return best[Math.floor(rnd() * best.length)] ?? moves[0];
}
