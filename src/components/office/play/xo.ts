'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';

// Noughts and crosses on the game table, shared by everyone in the office over the WebRTC events channel
// (newest move wins, late joiners catch up from a snapshot). The west chair plays X, the east chair O;
// someone sitting alone plays both. Nothing is stored.

export type Mark = 0 | 1 | 2; // empty, X, O
export interface XoState { cells: Mark[]; turn: 1 | 2; t: number; wins: [number, number] }
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export const emptyBoard = (): Mark[] => Array<Mark>(9).fill(0);
export function winnerOf(cells: Mark[]): { mark: 1 | 2; line: number[] } | 'draw' | null {
  for (const l of LINES) if (cells[l[0]] && cells[l[0]] === cells[l[1]] && cells[l[1]] === cells[l[2]]) return { mark: cells[l[0]] as 1 | 2, line: l };
  return cells.every(Boolean) ? 'draw' : null;
}
/** The board after `mark` plays `cell`, or null when that is not allowed. */
export function play(s: XoState, cell: number, mark: 1 | 2): Omit<XoState, 't'> | null {
  if (cell < 0 || cell > 8 || s.cells[cell] || s.turn !== mark || winnerOf(s.cells)) return null;
  const cells = s.cells.slice(); cells[cell] = mark;
  const w = winnerOf(cells);
  const wins: [number, number] = [...s.wins];
  if (w && w !== 'draw') wins[w.mark - 1] += 1;
  return { cells, turn: mark === 1 ? 2 : 1, wins };
}

let state: XoState = { cells: emptyBoard(), turn: 1, t: 0, wins: [0, 0] };
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();

const valid = (m: Record<string, unknown>) => Array.isArray(m.cells) && m.cells.length === 9 && m.cells.every((c) => c === 0 || c === 1 || c === 2)
  && (m.turn === 1 || m.turn === 2) && typeof m.t === 'number' && Array.isArray(m.wins) && m.wins.length === 2 && m.wins.every((n) => Number.isInteger(n) && n >= 0);

function accept(next: Omit<XoState, 't'>, t: number) {
  if (t <= state.t) return false;
  state = { ...next, t };
  listeners.forEach((l) => l());
  return true;
}
const send = () => mesh?.sendEvent({ type: 'xo', ...state });
const local = (next: Omit<XoState, 't'> | null) => { if (next && accept(next, Math.max(syncedNow(), state.t + 1))) send(); };

export const xo = {
  get: () => state,
  move(cell: number, mark: 1 | 2) { local(play(state, cell, mark)); },
  /** A new round; the loser (or O after a draw) starts. Scores stay. */
  again() {
    const w = winnerOf(state.cells);
    local({ cells: emptyBoard(), turn: w && w !== 'draw' ? (w.mark === 1 ? 2 : 1) : state.turn, wins: state.wins });
  },
  resetScores() { local({ cells: emptyBoard(), turn: 1, wins: [0, 0] }); },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useXo = () => useSyncExternalStore(xo.subscribe, xo.get, xo.get);

export function connectXo(m: Mesh | null) {
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent((_, msg) => { if (msg.type === 'xo' && valid(msg)) accept({ cells: msg.cells as Mark[], turn: msg.turn as 1 | 2, wins: msg.wins as [number, number] }, msg.t as number); });
  const offPeers = m.onPeers(() => setTimeout(() => { if (state.t > 0) send(); }, 1000));
  return () => { off(); offPeers(); mesh = null; };
}
