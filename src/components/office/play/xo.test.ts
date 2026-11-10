import { describe, it, expect, vi } from 'vitest';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { emptyBoard, play, winnerOf, type Mark, type XoState } from './xo';

type Handler = (from: PeerInfo, msg: Record<string, unknown>) => void;
function pair() {
  const handlers: Record<string, Handler[]> = { a: [], b: [] };
  const side = (me: 'a' | 'b', other: 'a' | 'b') => ({
    onEvent(cb: Handler) { handlers[me].push(cb); return () => {}; },
    onPeers() { return () => {}; },
    sendEvent(msg: Record<string, unknown>) { const copy = JSON.parse(JSON.stringify(msg)); handlers[other].forEach((h) => h({ userId: me, tabId: me, device: 'computer' }, copy)); },
  }) as unknown as Mesh;
  return { a: side('a', 'b'), b: side('b', 'a') };
}
const state = (cells: Mark[], turn: 1 | 2 = 1): XoState => ({ cells, turn, t: 1, wins: [0, 0] });

describe('noughts and crosses', () => {
  it('finds rows, columns, diagonals and draws', () => {
    expect(winnerOf([1, 1, 1, 0, 2, 2, 0, 0, 0])).toEqual({ mark: 1, line: [0, 1, 2] });
    expect(winnerOf([2, 1, 0, 1, 2, 0, 1, 0, 2])).toEqual({ mark: 2, line: [0, 4, 8] });
    expect(winnerOf([1, 2, 1, 1, 2, 2, 2, 1, 1])).toBe('draw');
    expect(winnerOf(emptyBoard())).toBeNull();
  });
  it('allows only the side whose turn it is, on an empty square, while the round is open', () => {
    const s = state(emptyBoard());
    expect(play(s, 4, 2)).toBeNull();
    const next = play(s, 4, 1)!;
    expect(next.cells[4]).toBe(1);
    expect(next.turn).toBe(2);
    expect(play({ ...next, t: 2 }, 4, 2)).toBeNull();
    expect(play(state([1, 1, 1, 0, 2, 2, 0, 0, 0], 2), 3, 2)).toBeNull();
  });
  it('counts a win', () => {
    expect(play(state([1, 1, 0, 2, 2, 0, 0, 0, 0]), 2, 1)!.wins).toEqual([1, 0]);
  });
  it('keeps both chairs on the same board', async () => {
    const net = pair();
    vi.resetModules(); const A = await import('./xo');
    vi.resetModules(); const B = await import('./xo');
    A.connectXo(net.a); B.connectXo(net.b);
    A.xo.move(4, 1); B.xo.move(0, 2); A.xo.move(0, 1); // the last one is not allowed
    expect(B.xo.get().cells).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(A.xo.get().cells).toEqual(B.xo.get().cells);
    expect(A.xo.get().turn).toBe(1);
  });
});
