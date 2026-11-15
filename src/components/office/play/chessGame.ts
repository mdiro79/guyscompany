'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { apply, key, legalMoves, resultOf, san, sameMove, startPosition, colorOf, type Color, type Move, type Piece, type Position, type Result } from './chess';

// The game on the café's chess table, the same for everyone in the office (newest move wins over the
// WebRTC events channel, late joiners catch up from whoever is there). Whoever sits on the east chair
// plays white, on the west chair black; alone at the table one plays the computer (run by one's own
// device). Anyone walking by sees the game on the table. Nothing is stored.

export interface ChessState {
  pos: Position;
  keys: string[]; // earlier positions (threefold repetition)
  sans: string[]; // the moves so far in standard notation
  last: Move | null;
  captured: Piece[]; // in the order they were taken
  result: Result | null;
  used: [number, number]; // milliseconds thought by white and black before the current turn
  turnAt: number; // shared clock when the current turn began (0: the game has not started)
  game: number; // counts games, so a new one is recognised
}

const fresh = (game = 1): ChessState => ({ pos: startPosition(), keys: [], sans: [], last: null, captured: [], result: null, used: [0, 0], turnAt: 0, game });
let state: ChessState & { t: number } = { ...fresh(), t: 0 };
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();

function accept(next: ChessState, t: number) {
  if (t <= state.t) return false;
  state = { ...next, t };
  listeners.forEach((l) => l());
  return true;
}
const send = () => mesh?.sendEvent({ type: 'chess', s: state, t: state.t });
const local = (next: ChessState | null) => { if (next && accept(next, Math.max(syncedNow(), state.t + 1))) send(); };

/** The state after `color` plays `m`, or null when that is not allowed. */
export function playMove(s: ChessState, m: Move, color: Color, now: number): ChessState | null {
  if (s.result || s.pos.turn !== color) return null;
  const legal = legalMoves(s.pos).find((x) => sameMove(x, m));
  if (!legal) return null;
  const next = apply(s.pos, legal);
  const taken = s.pos.board[legal.to] || (s.pos.board[legal.from].toLowerCase() === 'p' && legal.to === s.pos.ep ? (color === 'w' ? 'p' : 'P') : '');
  const keys = [...s.keys, key(s.pos)];
  const used: [number, number] = [...s.used];
  if (s.turnAt) used[color === 'w' ? 0 : 1] += Math.max(0, now - s.turnAt);
  return {
    pos: next, keys: keys.slice(-120), sans: [...s.sans, san(s.pos, legal)].slice(-400), last: legal,
    captured: taken ? [...s.captured, taken as Piece] : s.captured, result: resultOf(next, keys), used, turnAt: now, game: s.game,
  };
}

export const chessGame = {
  get: () => state,
  move(m: Move, color: Color) { local(playMove(state, m, color, syncedNow())); },
  resign(color: Color) { if (!state.result) local({ ...state, result: { winner: color === 'w' ? 'b' : 'w', reason: 'resign' } }); },
  newGame() { local(fresh(state.game + 1)); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useChess = () => useSyncExternalStore(chessGame.subscribe, chessGame.get, chessGame.get);

// ——— What arrives from others ———
const PIECES = new Set(['', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
const sq = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64;
export function cleanChess(v: unknown): ChessState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, p = o.pos as Record<string, unknown> | undefined;
  if (!p || !Array.isArray(p.board) || p.board.length !== 64 || !p.board.every((x) => typeof x === 'string' && PIECES.has(x))) return null;
  if (p.turn !== 'w' && p.turn !== 'b') return null;
  const board = p.board as Piece[];
  if (board.filter((x) => x === 'K').length !== 1 || board.filter((x) => x === 'k').length !== 1) return null;
  const pos: Position = {
    board, turn: p.turn, castle: typeof p.castle === 'string' ? p.castle.replace(/[^KQkq]/g, '').slice(0, 4) : '',
    ep: sq(p.ep) ? (p.ep as number) : -1, half: Number.isInteger(p.half) ? Math.max(0, p.half as number) : 0, full: Number.isInteger(p.full) ? Math.max(1, p.full as number) : 1,
  };
  const strs = (a: unknown, max: number) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && x.length < 120).slice(-max) : []);
  const l = o.last as Record<string, unknown> | null;
  const last: Move | null = l && sq(l.from) && sq(l.to) ? { from: l.from as number, to: l.to as number, ...(l.promo === 'q' || l.promo === 'r' || l.promo === 'b' || l.promo === 'n' ? { promo: l.promo } : {}) } : null;
  const r = o.result as Record<string, unknown> | null;
  const reasons = ['mate', 'stalemate', 'fifty', 'material', 'repetition', 'resign'];
  const result: Result | null = r && reasons.includes(r.reason as string) ? { winner: r.winner === 'w' || r.winner === 'b' ? r.winner : null, reason: r.reason as Result['reason'] } : null;
  const used = Array.isArray(o.used) && o.used.length === 2 && o.used.every((x) => typeof x === 'number' && x >= 0) ? [o.used[0], o.used[1]] as [number, number] : [0, 0] as [number, number];
  return {
    pos, keys: strs(o.keys, 120), sans: strs(o.sans, 400), last,
    captured: Array.isArray(o.captured) ? (o.captured.filter((x) => typeof x === 'string' && PIECES.has(x) && x && colorOf(x as Piece)) as Piece[]).slice(0, 30) : [],
    result, used, turnAt: typeof o.turnAt === 'number' ? o.turnAt : 0, game: Number.isInteger(o.game) ? (o.game as number) : 1,
  };
}

export function connectChess(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => {
    if (msg.type !== 'chess' || typeof msg.t !== 'number') return;
    const s = cleanChess(msg.s);
    if (s) accept(s, msg.t);
  });
  const offPeers = m.onPeers(() => setTimeout(() => { if (state.t > 0) send(); }, 1300));
  return () => { off(); offPeers(); mesh = null; };
}
