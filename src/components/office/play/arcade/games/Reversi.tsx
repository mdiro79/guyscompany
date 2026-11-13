'use client';
import { WorldStage, type Game3 } from '../kit/World';
import { seatPills, useBoard } from '../kit/board';
import { Fx, label } from '../kit/fx';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { N, counts, flips, movesFor, type ReversiMove, type ReversiState } from '../rules/reversi';

export { rules } from '../rules/reversi';

// Reversi on a 3D table: two-coloured discs that hop and turn over when they flip, glowing dots where a
// move is allowed, the last disc ringed.

const C = 10, S = N * C, R = 4.1, HALF = 0.7;
type Props = BoardProps<ReversiState, ReversiMove>;

export default function Reversi(props: Props) {
  const { api, get } = useBoard(props);
  return <WorldStage api={api} size={[S, S]} init={(w) => { w.tilt = 0.45; return create(get); }} />;
}

function create(get: () => Props): Game3 {
  const fx = new Fx();
  let prev = get().s, time = 0, flipAt = new Map<number, number>(), note = 0, proj: (x: number, y: number, z?: number) => [number, number] = (x, y) => [x, y];
  const center = (i: number) => [(i % N) * C + C / 2, Math.floor(i / N) * C + C / 2] as const;
  return {
    step(dt) {
      time += dt; fx.step(dt); note = Math.max(0, note - dt);
      const s = get().s;
      if (s === prev) return;
      flipAt = new Map();
      s.b.forEach((v, i) => { if (v && prev.b[i] && prev.b[i] !== v) flipAt.set(i, time + Math.hypot((i % N) - (s.last % N), Math.floor(i / N) - Math.floor(s.last / N)) * 0.06); });
      if (s.last >= 0 && s.b.some((v, i) => v !== prev.b[i])) { fx.pop(...proj(...center(s.last), 2), '#ffffff', 26); sfx.place(); }
      if (s.skipped) note = 2;
      prev = s;
    },
    render(w, t) {
      const p = w.pal, { s, canMove, seat, colors } = get();
      proj = w.to2d;
      w.box(S / 2, S / 2, S + 6, S + 6, 3, p.dark ? '#3a2a1c' : '#8a5a3a', { z: -3.05 });
      for (let i = 0; i < 64; i++) { const [x, y] = center(i); w.box(x, y, C - 0.6, C - 0.6, 0.6, (i + Math.floor(i / N)) % 2 ? '#2f9c7c' : '#36ad8a', { z: -0.6 }); }
      const hints = canMove ? movesFor(s.b, seat + 1) : [];
      for (let i = 0; i < 64; i++) {
        const [x, y] = center(i), v = s.b[i];
        if (v) {
          const at = flipAt.get(i), k = at === undefined ? 1 : Math.min(1, Math.max(0, (time - at) / 0.35));
          const showing = k < 0.5 && at !== undefined ? 3 - v : v, hop = Math.sin(k * Math.PI) * 5;
          if (i === s.last) w.disc(x, y, R + 0.6, 0.1, p.white, 0.01);
          w.disc(x, y, R, HALF, colors[2 - showing], hop);
          w.disc(x, y, R, HALF, colors[showing - 1], hop + HALF);
        } else if (hints.includes(i)) w.disc(x, y, 1.1 + Math.sin(t * 5) * 0.2, 0.3, colors[seat], 0.02);
      }
    },
    hud(g, w) {
      const p = w.pal, { s, names, colors } = get(), [a, b] = counts(s.b);
      fx.begin(g);
      seatPills(g, p, [0, 1].map((i) => ({ name: names[i], value: String(i ? b : a), color: colors[i], active: s.turn === i && !s.over })));
      if (note > 0) { const [x, y] = w.to2d(S / 2, S / 2, 6); g.globalAlpha = Math.min(1, note); label(g, p, '⏭', x, y, 44, p.sun); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    tap(x, y) {
      const { s, canMove, seat, move } = get();
      const c = Math.floor(x / C), r = Math.floor(y / C);
      if (!canMove || c < 0 || c >= N || r < 0 || r >= N) return;
      if (flips(s.b, r * N + c, seat + 1).length) move(r * N + c); else sfx.bad();
    },
  };
}
