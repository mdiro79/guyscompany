import { describe, expect, it } from 'vitest';
import { apply, bestMove, fromFen, key, legalMoves, perft, resultOf, san, startPosition, type Move, type Position } from './chess';
import { rng } from './arcade/kit/rng';

// Move counts after n moves from well-known positions (they catch every kind of rule mistake).
describe('chess moves follow the rules', () => {
  it('from the start', () => {
    const p = startPosition();
    expect(perft(p, 1)).toBe(20); expect(perft(p, 2)).toBe(400); expect(perft(p, 3)).toBe(8902);
  });
  it('a tricky middle game (castling, en passant, promotion, pins)', () => {
    const p = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(p, 1)).toBe(48); expect(perft(p, 2)).toBe(2039);
  });
  it('an endgame with en passant checks', () => {
    const p = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(p, 1)).toBe(14); expect(perft(p, 2)).toBe(191); expect(perft(p, 3)).toBe(2812);
  });
  it('promotions and castling rights after captures', () => {
    const p = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(p, 1)).toBe(6); expect(perft(p, 2)).toBe(264); expect(perft(p, 3)).toBe(9467);
  });
});

describe('game ends and notation', () => {
  it("fool's mate is checkmate", () => {
    let p = startPosition();
    for (const [f, t] of [[13, 21], [52, 36], [14, 30], [59, 31]]) p = apply(p, { from: f, to: t });
    expect(resultOf(p)).toEqual({ winner: 'b', reason: 'mate' });
  });
  it('stalemate and too little material', () => {
    expect(resultOf(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))?.reason).toBe('stalemate');
    expect(resultOf(fromFen('8/8/4k3/8/8/3NK3/8/8 w - - 0 1'))?.reason).toBe('material');
  });
  it('writes moves in standard notation', () => {
    const p = startPosition();
    expect(san(p, { from: 6, to: 21 })).toBe('Nf3');
    expect(san(p, { from: 12, to: 28 })).toBe('e4');
    expect(san(fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'), { from: 48, to: 56, promo: 'q' })).toBe('a8=Q+');
    expect(san(fromFen('r3k3/8/8/8/8/8/8/4K2R w K - 0 1'), { from: 4, to: 6 })).toBe('O-O');
  });
});

describe('the computer player', () => {
  it('takes a free queen and finds mate in one', () => {
    const free = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
    expect(bestMove(free, 2, rng(1))).toEqual({ from: 11, to: 35 });
    const mate = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const m = bestMove(mate, 2, rng(2))!;
    expect(resultOf(apply(mate, m))?.reason).toBe('mate');
  });
  it('plays whole games against itself by the rules', () => {
    const rnd = rng(7);
    for (let g = 0; g < 2; g++) {
      let p: Position = startPosition();
      const seen: string[] = [];
      let n = 0;
      while (!resultOf(p, seen) && n < 300) {
        const m: Move = bestMove(p, 1, rnd)!;
        expect(legalMoves(p).some((x) => x.from === m.from && x.to === m.to)).toBe(true);
        seen.push(key(p)); p = apply(p, m); n++;
      }
      expect(n).toBeGreaterThan(0);
    }
  });
});
