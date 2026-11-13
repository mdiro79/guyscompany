'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, label, rrect, scene, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { N, counts, flips, movesFor, type ReversiMove, type ReversiState } from '../rules/reversi';

export { rules } from '../rules/reversi';

const C = 41, W = 360, LEFT = (W - N * C) / 2, TOP = 64, H = TOP + N * C + 18;
type Props = BoardProps<ReversiState, ReversiMove>;

export default function Reversi(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, flipAt = new Map<number, number>(), time = 0, note = 0;
  const center = (i: number) => [LEFT + (i % N) * C + C / 2, TOP + Math.floor(i / N) * C + C / 2] as const;
  return {
    step(dt) {
      time += dt; fx.step(dt); note = Math.max(0, note - dt);
      const s = get().s;
      if (s !== prev) {
        // Discs that changed sides turn over; the new one pops in.
        flipAt = new Map();
        s.b.forEach((v, i) => { if (v && prev.b[i] && prev.b[i] !== v) flipAt.set(i, time + Math.hypot((i % N) - (s.last % N), Math.floor(i / N) - Math.floor(s.last / N)) * 0.05); });
        if (s.last >= 0 && s.b.some((v, i) => v !== prev.b[i])) { const [x, y] = center(s.last); fx.pop(x, y, '#ffffff', C * 0.7); sfx.place(); }
        if (s.skipped) note = 2;
        prev = s;
      }
    },
    draw(g, t) {
      const p = theme.get(), { s, canMove, seat, colors, names } = get();
      fx.begin(g);
      scene(g, W, H, t, p);
      // Counts
      const [a, b] = counts(s.b);
      [a, b].forEach((n, i) => {
        const x = i === 0 ? LEFT + 60 : W - LEFT - 60;
        tile(g, p, x - 58, 16, 116, 34, 17, p.paper, 2, 3);
        ball(g, p, x - 38, 33, 11, colors[i], 2, 0);
        write(g, p, String(n), x - 12, 34, 17, 800);
        write(g, p, names[i], x + 28, 34, 10, 600, p.soft, 44);
        if (s.turn === i && !s.over) { g.strokeStyle = colors[i]; g.lineWidth = 3; rrect(g, x - 58, 16, 116, 34, 17); g.stroke(); }
      });
      tile(g, p, LEFT - 6, TOP - 6, N * C + 12, N * C + 12, 14, p.teal, 2, 4);
      const hints = canMove ? movesFor(s.b, seat + 1) : [];
      for (let i = 0; i < 64; i++) {
        const x = LEFT + (i % N) * C, y = TOP + Math.floor(i / N) * C, [cx, cy] = center(i);
        g.fillStyle = (i + Math.floor(i / N)) % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)';
        rrect(g, x + 1.5, y + 1.5, C - 3, C - 3, 6); g.fill();
        const v = s.b[i];
        if (v) {
          const at = flipAt.get(i), k = at === undefined ? 1 : Math.min(1, Math.max(0, (time - at) / 0.28));
          // Turning over: squeezed flat in the middle of the turn, showing the old colour first.
          const squeeze = Math.abs(Math.cos(k * Math.PI)), color = colors[(k < 0.5 && at !== undefined ? 3 - v : v) - 1];
          g.save(); g.translate(cx, cy); g.scale(Math.max(0.08, squeeze), 1); ball(g, p, 0, 0, C * 0.38, color, 2, 2); g.restore();
        } else if (hints.includes(i)) {
          g.globalAlpha = 0.55 + Math.sin(t * 5) * 0.2; g.fillStyle = colors[seat]; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        if (i === s.last) { g.strokeStyle = p.white; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, C * 0.44, 0, TAU); g.stroke(); }
      }
      if (note > 0) { g.globalAlpha = Math.min(1, note); label(g, p, '⏭', W / 2, TOP + (N * C) / 2, 40, p.sun); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    tap(x, y) {
      const { s, canMove, seat, move } = get();
      const c = Math.floor((x - LEFT) / C), r = Math.floor((y - TOP) / C);
      if (!canMove || c < 0 || c >= N || r < 0 || r >= N) return;
      if (flips(s.b, r * N + c, seat + 1).length) move(r * N + c); else sfx.bad();
    },
  };
}
