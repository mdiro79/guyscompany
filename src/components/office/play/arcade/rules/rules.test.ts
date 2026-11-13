import { describe, it, expect } from 'vitest';
import { rng } from '../kit/rng';
import { playout, type Rules } from './types';
import { rules as four, landing, COLS } from './four';
import { rules as reversi, flips, movesFor } from './reversi';
import { rules as checkers, legal as checkersLegal } from './checkers';
import { rules as nard, legal as nardLegal, canPlay, BAR, type NardState } from './nard';
import { rules as dice, scoreOf, scores, TARGET } from './dice';
import { rules as darts, scoreAt, tripleOf, ROUNDS as DART_ROUNDS } from './darts';
import { rules as archery, ROUNDS as ARROW_ROUNDS } from './archery';
import { rules as cannons, fly, tankAt, MAX_HP } from './cannons';
import { rules as soccer, FW, FH, DR, WIN } from './soccer';

// Every game is played to the end many times with the computer on all seats: the computer never makes an
// illegal move, every game ends, and the state survives being sent as JSON (as it is between browsers).
function soak<S, M>(name: string, rules: Rules<S, M>, games: number, players: number[], maxMoves = 3000) {
  it(`${name}: the computer plays ${games} whole games by the rules`, () => {
    const rnd = rng(42);
    for (let g = 0; g < games; g++) {
      const n = players[g % players.length];
      const { s, moves } = playout(rules, n, 1000 + g, rnd, maxMoves);
      expect(moves).toBeGreaterThan(0);
      const res = rules.result(s)!;
      expect(res.winners.every((w) => w >= 0 && w < n)).toBe(true);
      expect(rules.turn(s)).toBe(-1);
      expect(rules.result(JSON.parse(JSON.stringify(s)))).toEqual(res);
    }
  });
}

describe('four in a row', () => {
  soak('four', four, 4, [2]);
  it('drops, wins and refuses a full column', () => {
    let s = four.init(2, 1, 0);
    for (const c of [0, 1, 0, 1, 0, 1]) s = four.apply(s, s.turn, c)!;
    expect(four.result(s)).toBeNull();
    expect(four.apply(s, 1, 0)).toBeNull(); // not their turn
    s = four.apply(s, 0, 0)!;
    expect(four.result(s)).toEqual({ winners: [0] });
    expect(four.apply(s, 1, 1)).toBeNull();
    let t = four.init(2, 1, 0);
    for (let i = 0; i < 6; i++) t = four.apply(t, t.turn, 3)!;
    expect(landing(t.b, 3)).toBe(-1);
    expect(four.apply(t, t.turn, 3)).toBeNull();
    expect(four.apply(t, t.turn, COLS)).toBeNull();
  });
  it('the computer takes a win and blocks a loss', () => {
    let s = four.init(2, 1, 0);
    for (const c of [0, 6, 1, 6, 2]) s = four.apply(s, s.turn, c)!; // seat 0 has 0,1,2 on the bottom row
    expect(four.bot(s, 1, rng(1))).toBe(3);
    s = four.apply(s, 1, 5)!;
    expect(four.bot(s, 0, rng(1))).toBe(3);
  });
});

describe('reversi', () => {
  soak('reversi', reversi, 3, [2]);
  it('flips trapped discs and rejects moves that flip nothing', () => {
    const s = reversi.init(2, 1, 0);
    expect(movesFor(s.b, 1).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
    expect(reversi.apply(s, 0, 0)).toBeNull();
    const n = reversi.apply(s, 0, 19)!;
    expect(n.b[19]).toBe(1); expect(n.b[27]).toBe(1); expect(n.turn).toBe(1);
    expect(flips(n.b, 19, 2)).toEqual([]);
  });
});

describe('checkers', () => {
  soak('checkers', checkers, 4, [2], 1500);
  it('makes captures compulsory and finishes multi-jumps', () => {
    const b = new Array(64).fill(0);
    b[44] = 1; b[35] = 3; b[17] = 3; b[62] = 1; b[1] = 3; // seat 0 at 44 can jump 35 then 17
    let s = { b, turn: 0, chain: -1, quiet: 0, last: null as [number, number] | null };
    expect(checkersLegal(s).map((m) => [m.from, m.to])).toEqual([[44, 26]]);
    expect(checkers.apply(s, 0, { from: 62, to: 53 })).toBeNull();
    s = checkers.apply(s, 0, { from: 44, to: 26 })!;
    expect(s.turn).toBe(0); expect(s.chain).toBe(26);
    s = checkers.apply(s, 0, { from: 26, to: 8 })!;
    expect(s.turn).toBe(1); expect(s.b[35]).toBe(0); expect(s.b[17]).toBe(0);
  });
  it('crowns a man on the far row and a player without moves loses', () => {
    const b = new Array(64).fill(0);
    b[10] = 1; b[40] = 3;
    const s = checkers.apply({ b, turn: 0, chain: -1, quiet: 0, last: null }, 0, { from: 10, to: 1 })!;
    expect(s.b[1]).toBe(2);
    const stuck = new Array(64).fill(0);
    stuck[56] = 1; stuck[49] = 3; stuck[42] = 3;
    expect(checkers.result({ b: stuck, turn: 0, chain: -1, quiet: 0, last: null })).toEqual({ winners: [1] });
  });
});

describe('backgammon', () => {
  soak('nard', nard, 12, [2], 2000);
  const pos = (over: Partial<NardState>): NardState => ({ p: new Array(24).fill(0), bar: [0, 0], off: [0, 0], turn: 0, dice: [], roll: [1, 1], seed: 1, n: 0, skipped: 0, last: null, ...over });
  it('starts with 15 checkers a side and a playable roll', () => {
    const s = nard.init(2, 5, 0);
    expect(s.p.filter((v) => v > 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(s.p.filter((v) => v < 0).reduce((a, b) => a + b, 0)).toBe(-15);
    expect(s.turn).toBe(0);
    expect(nardLegal(s).length).toBeGreaterThan(0);
  });
  it('enters from the bar first, cannot land on a closed point, and hits a lone checker', () => {
    const p = new Array(24).fill(0);
    p[23 - 3] = -2; p[21] = -1; p[5] = 3; // seat 0 enters on its 20 (die 4: closed) or 21 (die 3: a blot)
    const s = pos({ p, bar: [1, 0], dice: [4, 3] });
    expect(canPlay(s, 0, BAR, 4)).toBe(false);
    expect(nardLegal(s)).toEqual([{ from: BAR, die: 3 }]);
    const n = nard.apply(s, 0, { from: BAR, die: 3 })!;
    expect(n.bar).toEqual([0, 1]); expect(n.p[21]).toBe(1); expect(n.last?.hit).toBe(true);
    expect(nard.apply(s, 0, { from: 5, die: 3 })).toBeNull();
  });
  it('must play both dice when possible, and the larger one when only one can be played', () => {
    // One checker on 6, enemy points closing 2 and 4 away… playing the 2 first makes the 4 impossible? No:
    // from 5 (own index), die 5 lands on 0 and die 3 on 2; enemy closes own index 2 → only the 5 is playable.
    const p = new Array(24).fill(0);
    p[5] = 1; p[2] = -2; p[23] = -13;
    const s = pos({ p, off: [14, 0], dice: [5, 3] });
    // Not all home? It is (index 5 is home): 5 bears off… die 5 needs index 4; from 5 with die 5 lands on 0.
    expect(nardLegal(s).map((m) => m.die)).toEqual([5]);
    // Two checkers: playing 1 then 6 uses both dice, so the move that blocks the second die is not allowed.
    const q = new Array(24).fill(0);
    q[12] = 1; q[7] = 1; q[5] = -2; q[0] = -2; q[23] = -11;
    const t = pos({ p: q, off: [13, 0], dice: [6, 1] });
    const ms = nardLegal(t);
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) { const after = nard.apply(t, 0, m)!; expect(after.turn === 0 ? after.dice.length : 1).toBe(1); }
  });
  it('bears off only with everything home, the exact die or the rearmost checker', () => {
    const p = new Array(24).fill(0);
    p[3] = 2; p[1] = 1; p[23] = -15;
    const s = pos({ p, off: [12, 0], dice: [6, 2] });
    expect(canPlay(s, 0, 3, 6)).toBe(true); // rearmost: a larger die bears it off
    expect(canPlay(s, 0, 1, 6)).toBe(false); // not while a checker stands behind it
    expect(canPlay(s, 0, 1, 2)).toBe(true); // exact
    const out = new Array(24).fill(0);
    out[3] = 2; out[9] = 1; out[23] = -15;
    expect(canPlay(pos({ p: out, off: [12, 0], dice: [4] }), 0, 3, 4)).toBe(false);
    const last = new Array(24).fill(0);
    last[0] = 1; last[23] = -15;
    const end = nard.apply(pos({ p: last, off: [14, 0], dice: [3, 2] }), 0, { from: 0, die: 3 })!;
    expect(nard.result(end)).toEqual({ winners: [0] });
  });
});

describe('dice 10,000', () => {
  soak('dice', dice, 20, [2, 3, 4], 4000);
  it('scores sets the usual way', () => {
    expect(scoreOf([1])).toBe(100); expect(scoreOf([5, 5])).toBe(100); expect(scoreOf([2])).toBe(0);
    expect(scoreOf([1, 1, 1])).toBe(1000); expect(scoreOf([4, 4, 4])).toBe(400); expect(scoreOf([4, 4, 4, 4])).toBe(800);
    expect(scoreOf([2, 2, 2, 2, 2, 2])).toBe(1600); expect(scoreOf([3, 3, 3, 1, 5])).toBe(450); expect(scoreOf([3, 3, 3, 2])).toBe(0);
    expect(scoreOf([1, 2, 3, 4, 5, 6])).toBe(1500); expect(scoreOf([2, 2, 4, 4, 6, 6])).toBe(750);
    expect(scores([2, 3, 4, 6, 6])).toBe(false); expect(scores([2, 3, 4, 6, 5])).toBe(true); expect(scores([2, 2, 3, 3, 4, 4])).toBe(true);
  });
  it('rolls, keeps, banks and busts', () => {
    let s = dice.init(2, 3, 0);
    expect(dice.apply(s, 1, { t: 'roll' })).toBeNull();
    expect(dice.apply(s, 0, { t: 'keep', idx: [0], bank: false })).toBeNull();
    // Find a roll that scores and keep one scoring die.
    for (let seed = 1; ; seed++) { s = dice.apply(dice.init(2, seed, 0), 0, { t: 'roll' })!; if (s.dice.length) break; }
    const i = s.dice.findIndex((v) => v === 1 || v === 5);
    if (i >= 0) {
      expect(dice.apply(s, 0, { t: 'keep', idx: [i, i], bank: false })).toBeNull();
      const kept = dice.apply(s, 0, { t: 'keep', idx: [i], bank: true })!;
      expect(kept.scores[0]).toBe(s.dice[i] === 1 ? 100 : 50); expect(kept.turn).toBe(1); expect(kept.free).toBe(6);
    }
    // A bust passes the turn and keeps the score.
    for (let seed = 1; seed < 500; seed++) {
      const start = { ...dice.init(2, seed, 0), free: 1, pot: 400 };
      const b = dice.apply(start, 0, { t: 'roll' })!;
      if (b.bust) { expect(b.turn).toBe(1); expect(b.scores).toEqual([0, 0]); expect(b.bust.lost).toBe(400); return; }
    }
    throw new Error('no bust found');
  });
  it('the first to bank the target wins', () => {
    const s = { ...dice.init(2, 1, 0), scores: [TARGET - 100, 0], dice: [1, 2, 3], free: 3 };
    const end = dice.apply(s, 0, { t: 'keep', idx: [0], bank: true })!;
    expect(dice.result(end)).toEqual({ winners: [0], scores: [TARGET, 0] });
  });
});

describe('darts', () => {
  soak('darts', darts, 12, [2, 3, 4]);
  it('scores like a dartboard, doubles the golden wedge and gives a bonus dart for the bull', () => {
    expect(scoreAt(0, 0, 7)).toMatchObject({ pts: 50, bull: true });
    expect(scoreAt(0.06, 0, 7).pts).toBe(25);
    expect(scoreAt(0, -0.3, 7).pts).toBe(20); // straight up: the 20 wedge
    expect(scoreAt(0, -0.6, 7).pts).toBe(60); // its triple ring
    expect(scoreAt(0, -0.97, 7).pts).toBe(40); // its double ring
    expect(scoreAt(0, -0.3, 0).pts).toBe(40); // golden
    expect(scoreAt(0.3, 0, 7).pts).toBe(6); // right: 6
    expect(scoreAt(0, 0.3, 7).pts).toBe(3); // down: 3
    expect(scoreAt(-0.3, 0, 7).pts).toBe(11); // left: 11
    expect(scoreAt(0, -1.2, 7).pts).toBe(0);
    expect(scoreAt(...tripleOf(0), 7).pts).toBe(60);
    let s = darts.init(2, 4, 0);
    s = darts.apply(s, 0, { x: 0, y: 0 })!;
    expect(s.left).toBe(3); expect(s.scores[0]).toBe(50); // the bull gave the dart back
    s = darts.apply(s, 0, { x: 5, y: 5 })!; s = darts.apply(s, 0, { x: 5, y: 5 })!; s = darts.apply(s, 0, { x: 5, y: 5 })!;
    expect(s.turn).toBe(1); expect(s.round).toBe(0); expect(s.stuck.length).toBe(4);
    for (let i = 0; i < 3; i++) s = darts.apply(s, 1, { x: 5, y: 5 })!;
    expect(s.turn).toBe(0); expect(s.round).toBe(1); expect(s.stuck.length).toBe(3);
    expect(darts.apply(s, 1, { x: 0, y: 0 })).toBeNull();
    expect(DART_ROUNDS).toBe(5);
  });
});

describe('archery', () => {
  soak('archery', archery, 12, [2, 3, 4]);
  it('keeps score and refuses made-up hits', () => {
    let s = archery.init(2, 9, 1);
    expect(s.turn).toBe(1);
    expect(archery.apply(s, 1, { what: 'target', pts: 11, x: 0.5, y: 0.5 })).toBeNull();
    expect(archery.apply(s, 1, { what: 'bird' as never, pts: 3, x: 0.5, y: 0.5 })).toBeNull();
    s = archery.apply(s, 1, { what: 'apple', pts: 999, x: 0.5, y: 0.5 })!;
    expect(s.scores[1]).toBe(15);
    s = archery.apply(s, 1, { what: 'target', pts: 9, x: 2, y: -1 })!;
    expect(s.last).toMatchObject({ pts: 9, x: 1, y: 0 });
    s = archery.apply(s, 1, { what: 'miss', pts: 5, x: 0.5, y: 0.5 })!;
    expect(s.scores[1]).toBe(24); expect(s.turn).toBe(0); expect(s.round).toBe(0);
    expect(Math.abs(s.wind)).toBeLessThanOrEqual(1);
    expect(ARROW_ROUNDS).toBe(4);
  });
});

describe('cannons', () => {
  soak('cannons', cannons, 8, [2, 3, 4], 200);
  it('a shell flies in an arc, digs a crater and hurts what is near', () => {
    const s = cannons.init(2, 21, 0);
    expect(s.tanks.every((t) => t.hp === MAX_HP)).toBe(true);
    const calm = { ...s, wind: 0 };
    const up = fly(calm, 0, 90, 60);
    expect(up.hit).not.toBeNull(); // straight up comes straight down on the shooter
    expect(Math.abs(up.hit![0] - tankAt(calm, 0)[0])).toBeLessThan(14);
    const self = cannons.apply(calm, 0, { a: 90, p: 40 })!;
    expect(self.tanks[0].hp).toBeLessThan(MAX_HP); expect(self.shot?.dmg[0]).toBeGreaterThan(0);
    expect(self.h[s.tanks[0].c]).toBeLessThanOrEqual(s.h[s.tanks[0].c]);
    expect(self.turn).toBe(1);
    expect(cannons.apply(calm, 1, { a: 90, p: 40 })).toBeNull();
    expect(cannons.apply(calm, 0, { a: NaN, p: 40 })).toBeNull();
    const gone = fly(calm, 0, 175, 100);
    expect(gone.path.length).toBeGreaterThan(4);
  });
});

describe('flick soccer', () => {
  soak('soccer', soccer, 5, [2], 600);
  it('a flick moves the disc, the ball stays on the pitch and a goal resets the line-up', () => {
    const s = soccer.init(2, 3, 0);
    expect(soccer.apply(s, 0, { i: 7, vx: 0, vy: -300 })).toBeNull();
    expect(soccer.apply(s, 0, { i: 0, vx: 1, vy: 1 })).toBeNull();
    const n = soccer.apply(s, 0, { i: 3, vx: 0, vy: -300 })!;
    expect(n.turn).toBe(1); expect(n.play?.frames.length).toBeGreaterThan(1);
    for (const p of n.d) { expect(p.x).toBeGreaterThanOrEqual(DR - 1); expect(p.x).toBeLessThanOrEqual(FW - DR + 1); expect(p.y).toBeGreaterThanOrEqual(DR - 1); expect(p.y).toBeLessThanOrEqual(FH - DR + 1); }
    // A disc right behind the ball in front of the open goal scores.
    const open = { ...s, d: s.d.map((p, k) => (k === 3 ? { x: 150, y: 80 } : k >= 5 ? { x: 20 + (k - 5) * 5, y: 440 } : p)), ball: { x: 150, y: 50 } };
    const g = soccer.apply(open, 0, { i: 3, vx: 0, vy: -500 })!;
    expect(g.score).toEqual([1, 0]); expect(g.turn).toBe(1); expect(g.ball).toEqual({ x: FW / 2, y: FH / 2 });
    expect(soccer.result({ ...g, score: [WIN, 0] })).toMatchObject({ winners: [0] });
  });
});
