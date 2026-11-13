'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, rrect, scene, shape, star, tile } from '../kit/fx';
import { theme } from '../kit/theme';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { isKing, legal, pieceOwner, type CheckersMove, type CheckersState } from '../rules/checkers';

export { rules } from '../rules/checkers';

const C = 41, N = 8, W = 360, LEFT = (W - N * C) / 2, TOP = 22, H = TOP + N * C + 22;
type Props = BoardProps<CheckersState, CheckersMove>;

export default function Checkers(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, sel = -1, slide = 1, time = 0;
  // Seat 1 looks at the board from the other side.
  const view = (i: number) => (get().seat === 1 ? 63 - i : i);
  const center = (i: number) => { const v = view(i); return [LEFT + (v % N) * C + C / 2, TOP + Math.floor(v / N) * C + C / 2] as const; };
  return {
    step(dt) {
      time += dt; fx.step(dt); slide = Math.min(1, slide + dt / 0.2);
      const s = get().s;
      if (s !== prev) {
        const taken = prev.b.findIndex((v, i) => v && !s.b[i] && i !== s.last?.[0]);
        if (taken >= 0) { const [x, y] = center(taken); const p = theme.get(); fx.confetti(x, y, [p.white, p.sun], 10, 170); sfx.hit(); } else sfx.place();
        if (s.last && !isKing(prev.b[s.last[0]]) && isKing(s.b[s.last[1]])) { const [x, y] = center(s.last[1]); fx.pop(x, y, '#ffc93c', C); sfx.good(); }
        slide = 0; sel = s.chain; prev = s;
      }
    },
    draw(g, t) {
      const p = theme.get(), { s, canMove, colors } = get();
      fx.begin(g);
      scene(g, W, H, t, p);
      tile(g, p, LEFT - 6, TOP - 6, N * C + 12, N * C + 12, 14, p.paper, 2, 4);
      const steps = canMove ? legal(s) : [];
      if (canMove && s.chain >= 0) sel = s.chain;
      const targets = steps.filter((m) => m.from === sel).map((m) => m.to);
      for (let v = 0; v < 64; v++) {
        const x = LEFT + (v % N) * C, y = TOP + Math.floor(v / N) * C;
        if ((v + Math.floor(v / N)) % 2) { g.fillStyle = p.dark ? '#4a3d7a' : '#d9b48a'; rrect(g, x + 1, y + 1, C - 2, C - 2, 5); g.fill(); }
      }
      if (s.last) for (const i of s.last) { const [x, y] = center(i); g.fillStyle = 'rgba(255,201,60,0.3)'; rrect(g, x - C / 2 + 1, y - C / 2 + 1, C - 2, C - 2, 5); g.fill(); }
      for (const to of targets) { const [x, y] = center(to); g.fillStyle = p.mint; g.globalAlpha = 0.6 + Math.sin(t * 6) * 0.2; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.globalAlpha = 1; }
      for (let i = 0; i < 64; i++) {
        const piece = s.b[i];
        if (!piece) continue;
        let [x, y] = center(i);
        if (s.last && i === s.last[1] && slide < 1) { const [fx0, fy0] = center(s.last[0]); const k = 1 - (1 - slide) ** 3; x = fx0 + (x - fx0) * k; y = fy0 + (y - fy0) * k - Math.sin(k * Math.PI) * 8; }
        const movable = steps.some((m) => m.from === i), lift = i === sel ? 4 + Math.sin(t * 8) * 1.5 : 0;
        ball(g, p, x, y - lift, C * 0.37, colors[pieceOwner(piece)], 2, 3 + lift);
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - lift, C * 0.24, 0, TAU); g.stroke();
        if (isKing(piece)) shape(g, p, p.sun, () => star(g, x, y - lift, C * 0.2, 0), 1.5, 0);
        if (movable && i !== sel) { g.strokeStyle = p.white; g.lineWidth = 2; g.setLineDash([4, 4]); g.lineDashOffset = -t * 12; g.beginPath(); g.arc(x, y, C * 0.43, 0, TAU); g.stroke(); g.setLineDash([]); }
      }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    tap(x, y) {
      const { s, canMove, move } = get();
      const c = Math.floor((x - LEFT) / C), r = Math.floor((y - TOP) / C);
      if (!canMove || c < 0 || c >= N || r < 0 || r >= N) return;
      const i = view(r * N + c), steps = legal(s);
      if (sel >= 0 && steps.some((m) => m.from === sel && m.to === i)) { move({ from: sel, to: i }); sel = -1; return; }
      if (steps.some((m) => m.from === i)) { sel = i; sfx.tick(); } else if (s.chain < 0) sel = -1;
    },
  };
}
