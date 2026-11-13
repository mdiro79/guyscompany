'use client';
import { WorldStage, type Game3 } from '../kit/World';
import { seatPills, useBoard } from '../kit/board';
import { Fx } from '../kit/fx';
import { theme } from '../kit/theme';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { isKing, legal, pieceOwner, type CheckersMove, type CheckersState } from '../rules/checkers';

export { rules } from '../rules/checkers';

// Checkers on a 3D table, seen from one's own side. Pieces jump in an arc, kings wear a gold crown,
// pieces that can move are ringed and the squares a chosen piece can reach glow.

const C = 10, N = 8, S = N * C, R = 3.9;
type Props = BoardProps<CheckersState, CheckersMove>;

export default function Checkers(props: Props) {
  const { api, get } = useBoard(props);
  return <WorldStage api={api} size={[S, S]} init={(w) => { w.tilt = 0.5; w.spin = props.seat === 1 ? Math.PI : 0; return create(get); }} />;
}

function create(get: () => Props): Game3 {
  const fx = new Fx();
  let prev = get().s, sel = -1, slide = 1, proj: (x: number, y: number, z?: number) => [number, number] = (x, y) => [x, y];
  const center = (i: number) => [(i % N) * C + C / 2, Math.floor(i / N) * C + C / 2] as const;
  return {
    step(dt) {
      fx.step(dt); slide = Math.min(1, slide + dt / 0.24);
      const s = get().s;
      if (s === prev) return;
      const taken = prev.b.findIndex((v, i) => v && !s.b[i] && i !== s.last?.[0]);
      if (taken >= 0) { const p = theme.get(); fx.confetti(...proj(...center(taken), 2), [p.white, p.sun], 12, 180); sfx.hit(); } else sfx.place();
      if (s.last && !isKing(prev.b[s.last[0]]) && isKing(s.b[s.last[1]])) { fx.pop(...proj(...center(s.last[1]), 4), '#ffc93c', 34); sfx.good(); }
      slide = 0; sel = s.chain; prev = s;
    },
    render(w, t) {
      const p = w.pal, { s, canMove, colors } = get();
      proj = w.to2d;
      w.box(S / 2, S / 2, S + 6, S + 6, 3, p.dark ? '#3a2a1c' : '#8a5a3a', { z: -3.05 });
      const steps = canMove ? legal(s) : [];
      if (canMove && s.chain >= 0) sel = s.chain;
      const targets = steps.filter((m) => m.from === sel).map((m) => m.to);
      for (let i = 0; i < 64; i++) {
        const [x, y] = center(i), dark = (i + Math.floor(i / N)) % 2 === 1;
        const lit = !!s.last && s.last.includes(i);
        w.box(x, y, C - 0.4, C - 0.4, 0.6, lit ? '#e8c06a' : dark ? (p.dark ? '#4a3d7a' : '#b8865a') : (p.dark ? '#d8cbb5' : '#f3e5cc'), { z: -0.6 });
      }
      for (const to of targets) { const [x, y] = center(to); w.disc(x, y, 1.6 + Math.sin(t * 6) * 0.3, 0.3, p.mint, 0.02); }
      for (let i = 0; i < 64; i++) {
        const piece = s.b[i];
        if (!piece) continue;
        let [x, y] = center(i), z = 0;
        if (s.last && i === s.last[1] && slide < 1) { const [x0, y0] = center(s.last[0]), k = 1 - (1 - slide) ** 3; x = x0 + (x - x0) * k; y = y0 + (y - y0) * k; z = Math.sin(k * Math.PI) * 7; }
        if (i === sel) z += 2.2 + Math.sin(t * 8) * 0.6;
        const c = colors[pieceOwner(piece)];
        if (steps.some((m) => m.from === i) && i !== sel) w.disc(x, y, R + 0.7, 0.1, p.white, 0.01);
        w.disc(x, y, R, 1.3, c, z);
        w.disc(x, y, R * 0.62, 0.25, '#ffffff', z + 1.3);
        w.disc(x, y, R * 0.5, 0.3, c, z + 1.3);
        if (isKing(piece)) { w.disc(x, y, R * 0.92, 1.2, c, z + 1.6); w.ball(x, y, 1.3, p.sun, z + 2.6); }
      }
    },
    hud(g, w) {
      const p = w.pal, { s, names, colors } = get();
      fx.begin(g);
      const left = [0, 1].map((seat) => s.b.filter((v) => pieceOwner(v) === seat).length);
      seatPills(g, p, [0, 1].map((i) => ({ name: names[i], value: String(left[i]), color: colors[i], active: s.turn === i })));
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    tap(x, y) {
      const { s, canMove, move } = get();
      const c = Math.floor(x / C), r = Math.floor(y / C);
      if (!canMove || c < 0 || c >= N || r < 0 || r >= N) return;
      const i = r * N + c, steps = legal(s);
      if (sel >= 0 && steps.some((m) => m.from === sel && m.to === i)) { move({ from: sel, to: i }); sel = -1; return; }
      if (steps.some((m) => m.from === i)) { sel = i; sfx.tick(); } else if (s.chain < 0) sel = -1;
    },
  };
}
