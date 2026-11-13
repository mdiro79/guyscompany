'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, label, rrect, scene, shape, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { buzz, sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { DARTS, ORDER, RING, ROUNDS, type DartsMove, type DartsState } from '../rules/darts';

export { rules } from '../rules/darts';

// The dartboard. The sight follows the pointer (or the finger, a little above it) and wobbles; letting go
// throws the dart at wherever the sight is at that moment.

const W = 360, H = 500, CX = W / 2, CY = 232, R = 148;
type Props = BoardProps<DartsState, DartsMove>;

export default function Darts(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, aim: [number, number] = [CX, CY - 60], time = 0, fly: { from: [number, number]; to: [number, number]; k: number } | null = null, aiming = false, banner = 0, bannerText = '';
  const wobble = (t: number): [number, number] => [Math.sin(t * 2.3) * 9 + Math.sin(t * 5.3 + 1) * 5, Math.cos(t * 2.9 + 2) * 9 + Math.sin(t * 6.1) * 5];
  const sight = (): [number, number] => { const [wx, wy] = wobble(time); return [aim[0] + wx, aim[1] + wy]; };
  const throwAt = () => {
    if (!get().canMove || fly) return;
    fly = { from: [CX + (aim[0] - CX) * 0.3, H + 30], to: sight(), k: 0 };
    sfx.move();
  };
  return {
    step(dt) {
      time += dt; fx.step(dt); banner = Math.max(0, banner - dt);
      if (fly) {
        fly.k += dt / 0.2;
        if (fly.k >= 1) { const [x, y] = fly.to; fly = null; get().move({ x: (x - CX) / R, y: (y - CY) / R }); }
      }
      const s = get().s;
      if (s !== prev) {
        const d = s.stuck[s.stuck.length - 1];
        if (d && s.n !== prev.n) {
          const x = CX + d.x * R, y = CY + d.y * R, p = theme.get();
          fx.pop(x, y, '#ffffff', 22); fx.text(x, y - 18, d.pts ? `+${d.pts}` : '0', d.pts >= 40 ? p.sun : p.white, d.pts >= 40 ? 24 : 18);
          if (d.pts >= 40) { fx.confetti(x, y, [p.sun, p.coral, p.mint], 20, 230); sfx.great(); buzz(25); } else if (d.pts) sfx.place(); else sfx.bad();
          if (d.pts === 50) { banner = 1.6; bannerText = get().t('bonus'); }
        }
        prev = s;
      }
    },
    draw(g, t) {
      const p = theme.get(), { s, canMove, colors, names, phone } = get();
      fx.begin(g);
      scene(g, W, H, t, p);
      write(g, p, get().t('round', { n: Math.min(ROUNDS, s.round + 1), all: ROUNDS }), CX, 26, 14, 800);
      // Darts left this turn
      for (let i = 0; i < Math.max(DARTS, s.left); i++) { g.globalAlpha = i < s.left && s.round < ROUNDS ? 1 : 0.2; ball(g, p, CX - (Math.max(DARTS, s.left) - 1) * 9 + i * 18, 50, 5, colors[s.turn], 1.5, 0); }
      g.globalAlpha = 1;
      // The board
      shape(g, p, p.ink, () => { g.beginPath(); g.arc(CX, CY, R * 1.17, 0, TAU); }, 0, 5);
      const light = p.dark ? '#e9dfcc' : '#fff8ea', darkC = p.dark ? '#2a2247' : '#3a3157';
      const ring = (r0: number, r1: number, i: number, color: string) => { const a0 = ((i - 0.5) / 20) * TAU - Math.PI / 2, a1 = ((i + 0.5) / 20) * TAU - Math.PI / 2; g.fillStyle = color; g.beginPath(); g.arc(CX, CY, r1 * R, a0, a1); g.arc(CX, CY, r0 * R, a1, a0, true); g.closePath(); g.fill(); };
      for (let i = 0; i < 20; i++) {
        const even = i % 2 === 0, gold = i === s.wedge && s.round < ROUNDS;
        ring(RING.outer, RING.double[1], i, even ? darkC : light);
        ring(RING.triple[0], RING.triple[1], i, even ? p.coral : p.mint);
        ring(RING.double[0], RING.double[1], i, even ? p.coral : p.mint);
        if (gold) { g.globalAlpha = 0.5 + Math.sin(t * 5) * 0.2; ring(RING.outer, RING.double[1], i, p.sun); g.globalAlpha = 1; }
        const a = (i / 20) * TAU - Math.PI / 2;
        write(g, p, String(ORDER[i]), CX + Math.cos(a) * R * 1.085, CY + Math.sin(a) * R * 1.085, 11, 800, gold ? p.sun : '#ffffff');
      }
      g.strokeStyle = p.ink; g.lineWidth = 1;
      for (const r of [RING.outer, RING.triple[0], RING.triple[1], RING.double[0], RING.double[1]]) { g.beginPath(); g.arc(CX, CY, r * R, 0, TAU); g.stroke(); }
      g.fillStyle = p.mint; g.beginPath(); g.arc(CX, CY, RING.outer * R, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = p.coral; g.beginPath(); g.arc(CX, CY, RING.bull * R, 0, TAU); g.fill(); g.stroke();
      // Darts in the board
      for (const d of s.stuck) {
        const x = CX + d.x * R, y = CY + d.y * R;
        g.strokeStyle = p.ink; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 7, y + 13); g.stroke();
        ball(g, p, x + 9, y + 16, 5.5, colors[d.seat], 1.5, 0);
        g.fillStyle = p.ink; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
      }
      if (fly) { const k = fly.k, x = fly.from[0] + (fly.to[0] - fly.from[0]) * k, y = fly.from[1] + (fly.to[1] - fly.from[1]) * k - Math.sin(k * Math.PI) * 40; ball(g, p, x, y, 9 - k * 4, colors[s.turn], 2, 0); }
      // The sight
      if (canMove && !fly && (!phone || aiming)) {
        const [x, y] = sight();
        g.strokeStyle = p.ink; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.moveTo(x - 18, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 18, y); g.moveTo(x, y - 18); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 18); g.stroke();
        g.strokeStyle = colors[s.turn]; g.lineWidth = 2; g.stroke();
      }
      // Scores
      const n = s.scores.length, bw = (W - 16 - (n - 1) * 6) / n;
      s.scores.forEach((v, i) => {
        const x = 8 + i * (bw + 6), y = H - 62;
        tile(g, p, x, y, bw, 50, 12, p.paper, 2, 3);
        if (s.turn === i && s.round < ROUNDS) { g.strokeStyle = colors[i]; g.lineWidth = 3; rrect(g, x, y, bw, 50, 12); g.stroke(); }
        ball(g, p, x + 14, y + 15, 6, colors[i], 1.5, 0);
        g.font = '600 11px "Inter Variable", "Vazirmatn Variable", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = p.soft; g.fillText(names[i], x + 24, y + 16, bw - 30);
        write(g, p, String(v), x + bw / 2, y + 35, 17, 800);
      });
      if (banner > 0) { g.globalAlpha = Math.min(1, banner); label(g, p, bannerText, CX, CY, 26, p.sun, W - 30); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    pointer(e) {
      const { canMove, phone } = get();
      if (!canMove) { aiming = false; return; }
      if (e.type === 'up') { if (aiming || !phone) throwAt(); aiming = false; return; }
      if (e.type === 'down') aiming = true;
      // On a phone the sight sits above the finger, so it can be seen.
      aim = [Math.max(10, Math.min(W - 10, e.x)), Math.max(40, Math.min(CY + R * 1.2, e.y - (phone ? 64 : 0)))];
    },
  };
}
