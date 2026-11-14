import { describe, expect, it, vi } from 'vitest';
import { Fx } from '../kit/fx';
import { rng } from '../kit/rng';
import type { ArenaCtx, ArenaSim } from '../kit/arena';

vi.mock('../kit/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }), buzz: () => {} }));
const { makeSumo } = await import('./sumo');
const { makeRush } = await import('./rush');
const { makeVolley, teamOf } = await import('./volley');

// Every arena game is played to the end by computer players on every seat (as the host runs it), and a
// guest that only receives the host's snapshots ends up showing the same thing.
function ctx(n: number, seat = 0): ArenaCtx {
  return {
    n, seat, fx: new Fx(), t: (k) => k, to2d: (x, y) => [x, y],
    names: () => Array.from({ length: n }, (_, i) => `P${i}`), colors: () => Array.from({ length: n }, () => '#ff0000'), bots: () => Array.from({ length: n }, () => true),
  };
}
function playout(make: (c: ArenaCtx, rnd: () => number) => ArenaSim, n: number, seed: number, maxSeconds = 900) {
  const rnd = rng(seed), host = make(ctx(n), rnd), guest = make(ctx(n, 1), rng(seed + 1));
  const dt = 1 / 30;
  let t = 0;
  while (!host.winners().length && t < maxSeconds) {
    host.step(dt, Array.from({ length: n }, (_, i) => host.bot(i, dt)));
    if (Math.round(t * 30) % 2 === 0) guest.load(JSON.parse(JSON.stringify(host.snap())));
    else guest.predict(dt);
    t += dt;
  }
  return { host, guest, t };
}

describe('arena games, computer against computer', () => {
  for (const [name, make, sizes] of [['Sumo Bumpers', makeSumo, [2, 3, 6]], ['Coin Rush', makeRush, [2, 4, 6]], ['Sky Volley', makeVolley, [2, 3, 4]]] as const) {
    it(`${name}: every match ends with a winner`, () => {
      for (const n of sizes) for (let g = 0; g < 3; g++) {
        const { host, t } = playout(make, n, 100 + g * 7 + n);
        const w = host.winners();
        expect(t).toBeLessThan(900);
        expect(w.length).toBeGreaterThan(0);
        expect(w.every((s) => s >= 0 && s < n)).toBe(true);
        // The state survives the network as JSON and loads on a guest.
        const guest = make(ctx(n, 1), rng(1));
        expect(() => guest.load(JSON.parse(JSON.stringify(host.snap())))).not.toThrow();
      }
    });
  }

  it('Sky Volley: the winners are one whole team', () => {
    const { host } = playout(makeVolley, 4, 5);
    const w = host.winners();
    expect(w).toHaveLength(2);
    expect(teamOf(w[0])).toBe(teamOf(w[1]));
  });

  it('Coin Rush: lasts about a minute', () => {
    const { t } = playout(makeRush, 3, 9);
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThan(70);
  });
});
