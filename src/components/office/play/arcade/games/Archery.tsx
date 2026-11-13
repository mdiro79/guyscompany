'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, rrect, scene, shape, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { buzz, sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { ARROWS, POINTS, ROUNDS, type ArcheryMove, type ArcheryState, type Hit } from '../rules/archery';

export { rules } from '../rules/archery';

// The archery range. Hold to draw the bow (the longer, the faster and flatter the arrow), aim with the
// pointer and let go. The arrow needs a moment to arrive: the wind pushes it sideways on the way and it
// drops a little, and the targets keep moving, so a good shot leads its target.

const W = 360, H = 520, GROUND = 380, TR = 42, BOW: [number, number] = [W / 2, H - 92];
type Props = BoardProps<ArcheryState, ArcheryMove>;
interface Balloon { x: number; y: number; v: number; hue: number; pop: number }

export default function Archery(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, time = 0, aim: [number, number] = [W / 2, 200], draw = -1, arrow: { to: [number, number]; k: number; T: number } | null = null;
  const balloons: Balloon[] = [0, 1, 2].map((i) => ({ x: 60 + i * 120, y: GROUND - i * 90, v: 26 + i * 9, hue: i, pop: 0 }));
  const target = (t: number): [number, number] => [W / 2 + Math.sin(t * 0.85) * 104, 172 + Math.sin(t * 0.6) * 14];
  const apple = (t: number): [number, number] => [W / 2 + Math.cos(t * 0.5) * 128, 96 + Math.sin(t * 1.7) * 8];
  const power = () => (draw < 0 ? 0 : Math.min(1, (time - draw) / 0.9));

  const land = (x: number, y: number) => {
    const [tx, ty] = target(time), [ax, ay] = apple(time);
    let what: Hit = 'miss', pts = 0;
    const b = balloons.find((o) => o.pop <= 0 && Math.hypot(o.x - x, o.y - y) < 15);
    if (Math.hypot(ax - x, ay - y) < 10) { what = 'apple'; pts = POINTS.apple; }
    else if (b) { what = 'balloon'; pts = POINTS.balloon; b.pop = 0.0001; }
    else { const d = Math.hypot(tx - x, ty - y); if (d < TR) { what = 'target'; pts = Math.max(1, 10 - Math.floor(d / (TR / 10))); } }
    get().move({ what, pts, x: x / W, y: y / H });
  };
  const release = () => {
    if (draw < 0 || arrow || !get().canMove) { draw = -1; return; }
    const k = power(), T = 0.82 - 0.5 * k, wind = get().s.wind;
    arrow = { to: [aim[0] + wind * 78 * T, aim[1] + 52 * T * T], k: 0, T };
    draw = -1;
    sfx.move(); buzz(10);
  };

  return {
    step(dt) {
      time += dt; fx.step(dt);
      for (const b of balloons) {
        if (b.pop > 0) { b.pop += dt; if (b.pop > 0.9) { b.pop = 0; b.y = GROUND + 20; b.x = 40 + ((b.x * 7 + 91) % (W - 80)); } continue; }
        b.y -= b.v * dt; b.x += Math.sin(time * 1.3 + b.hue) * 8 * dt;
        if (b.y < 60) { b.y = GROUND + 20; b.x = 40 + ((b.x * 7 + 91) % (W - 80)); }
      }
      if (arrow) { arrow.k += dt / arrow.T; if (arrow.k >= 1) { const [x, y] = arrow.to; arrow = null; land(x, y); } }
      const s = get().s;
      if (s !== prev) {
        if (s.last && s.n !== prev.n) {
          const l = s.last, p = theme.get();
          // Shown where the shooter's arrow struck; on the other screens the targets are elsewhere by now, so the hit object flashes.
          const at: [number, number] = l.what === 'target' ? target(time) : l.what === 'apple' ? apple(time) : [l.x * W, l.y * H];
          fx.text(at[0], at[1] - 26, l.pts ? `+${l.pts}` : get().t('miss'), l.pts >= 9 ? p.sun : l.pts ? p.white : p.coral, l.pts >= 9 ? 26 : 18);
          fx.pop(at[0], at[1], '#ffffff', 26);
          if (l.pts >= 9) { fx.confetti(at[0], at[1], [p.sun, p.coral, p.sky], 22, 240); sfx.great(); } else if (l.pts) sfx.good(); else sfx.bad();
        }
        prev = s;
      }
    },
    draw(g, t) {
      const p = theme.get(), { s, canMove, colors, names } = get();
      fx.begin(g);
      scene(g, W, H, t, p, false);
      // Hills and the range
      g.fillStyle = p.dark ? '#2f4a54' : '#bfe3c0'; g.beginPath(); g.moveTo(0, GROUND - 60); g.quadraticCurveTo(90, GROUND - 130, 190, GROUND - 70); g.quadraticCurveTo(290, GROUND - 20, W, GROUND - 100); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = p.dark ? '#27603f' : '#8fd18a'; g.fillRect(0, GROUND, W, H - GROUND);
      g.strokeStyle = p.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
      // Wind flag
      const wind = s.wind, fxp = 34, fyp = 34;
      g.strokeStyle = p.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(fxp, fyp - 14); g.lineTo(fxp, fyp + 22); g.stroke();
      shape(g, p, p.coral, () => { g.beginPath(); g.moveTo(fxp, fyp - 14); g.quadraticCurveTo(fxp + wind * 20, fyp - 18 + Math.sin(t * 8) * 3, fxp + wind * 34, fyp - 6 + Math.sin(t * 6) * 3); g.lineTo(fxp, fyp + 2); g.closePath(); }, 2, 0);
      write(g, p, `${wind > 0 ? '→' : wind < 0 ? '←' : '·'} ${Math.round(Math.abs(wind) * 10)}`, fxp + 4, fyp + 34, 11, 800, p.soft);
      write(g, p, get().t('round', { n: Math.min(ROUNDS, s.round + 1), all: ROUNDS }), W / 2, 22, 13, 800);
      // Golden apple on a pole
      const [ax, ay] = apple(t);
      g.strokeStyle = p.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay + 7); g.lineTo(ax, ay + 40); g.stroke();
      ball(g, p, ax, ay, 8, p.sun, 2, 2);
      // The sliding target
      const [tx, ty] = target(t);
      g.strokeStyle = p.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(tx - 18, ty + TR); g.lineTo(tx - 26, GROUND - 40); g.moveTo(tx + 18, ty + TR); g.lineTo(tx + 26, GROUND - 40); g.stroke();
      shape(g, p, p.white, () => { g.beginPath(); g.arc(tx, ty, TR, 0, TAU); }, 2, 4);
      [p.ink, p.sky, p.coral, p.sun].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(tx, ty, TR * (0.8 - i * 0.2), 0, TAU); g.fill(); });
      // Balloons
      for (const b of balloons) {
        if (b.pop > 0) continue;
        const c = [p.pink, p.sky, p.mint][b.hue % 3];
        g.strokeStyle = p.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(b.x, b.y + 14); g.quadraticCurveTo(b.x + 5, b.y + 26, b.x - 2, b.y + 38); g.stroke();
        g.save(); g.translate(b.x, b.y); g.scale(1, 1.15); ball(g, p, 0, 0, 13, c, 2, 0); g.restore();
      }
      // The arrow in flight (getting smaller as it flies away)
      if (arrow) {
        const k = arrow.k, x = BOW[0] + (arrow.to[0] - BOW[0]) * k, y = BOW[1] + (arrow.to[1] - BOW[1]) * k - Math.sin(k * Math.PI) * 30 * arrow.T, len = 30 - k * 18;
        const a = Math.atan2(arrow.to[1] - BOW[1], arrow.to[0] - BOW[0]);
        g.strokeStyle = p.ink; g.lineWidth = 5 - k * 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(a) * len, y - Math.sin(a) * len); g.stroke();
        g.strokeStyle = p.sun; g.lineWidth = 2.5 - k; g.stroke();
      }
      // The bow: its string comes back with the draw
      const k = power(), [bx, by] = BOW, ang = Math.atan2(aim[1] - by, aim[0] - bx);
      g.save(); g.translate(bx, by); g.rotate(ang);
      g.strokeStyle = p.ink; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(-14, 0, 44, -1.05, 1.05); g.stroke();
      g.strokeStyle = colors[s.turn]; g.lineWidth = 4; g.stroke();
      const sx = -14 + Math.cos(1.05) * 44, sy = Math.sin(1.05) * 44;
      g.strokeStyle = p.text; g.lineWidth = 1.5; g.beginPath(); g.moveTo(sx, -sy); g.lineTo(sx - k * 26, 0); g.lineTo(sx, sy); g.stroke();
      if (canMove && !arrow) { g.strokeStyle = p.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(sx - k * 26, 0); g.lineTo(sx - k * 26 + 44, 0); g.stroke(); g.strokeStyle = p.sun; g.lineWidth = 2; g.stroke(); }
      g.restore();
      // The sight and the draw meter
      if (canMove && !arrow) {
        const [x, y] = aim;
        g.strokeStyle = p.ink; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 11, 0, TAU); g.moveTo(x - 17, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 17, y); g.moveTo(x, y - 17); g.lineTo(x, y - 5); g.moveTo(x, y + 5); g.lineTo(x, y + 17); g.stroke();
        g.strokeStyle = colors[s.turn]; g.lineWidth = 2; g.stroke();
        tile(g, p, W / 2 - 60, H - 150, 120, 12, 6, p.paper, 2, 0);
        if (k > 0) { g.fillStyle = k > 0.85 ? p.coral : p.mint; rrect(g, W / 2 - 57, H - 147, 114 * k, 6, 3); g.fill(); }
      }
      // Scores and arrows left
      const n = s.scores.length, bw = (W - 16 - (n - 1) * 6) / n;
      s.scores.forEach((v, i) => {
        const x = 8 + i * (bw + 6), y = H - 56;
        tile(g, p, x, y, bw, 46, 12, p.paper, 2, 3);
        if (s.turn === i && s.round < ROUNDS) { g.strokeStyle = colors[i]; g.lineWidth = 3; rrect(g, x, y, bw, 46, 12); g.stroke(); }
        ball(g, p, x + 13, y + 14, 6, colors[i], 1.5, 0);
        g.font = '600 11px "Inter Variable", "Vazirmatn Variable", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = p.soft; g.fillText(names[i], x + 23, y + 15, bw - 28);
        write(g, p, `${v}${s.turn === i && s.round < ROUNDS ? `  ${'➶'.repeat(Math.max(0, Math.min(ARROWS, s.left)))}` : ''}`, x + bw / 2, y + 33, 15, 800);
      });
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    pointer(e) {
      const { canMove, phone } = get();
      if (!canMove) { draw = -1; return; }
      if (e.type === 'up') { release(); return; }
      aim = [Math.max(8, Math.min(W - 8, e.x)), Math.max(40, Math.min(GROUND - 4, e.y - (phone ? 70 : 0)))];
      if (e.type === 'down' && !arrow) { draw = time; sfx.tick(); }
    },
    key(code, down) { if (code !== 'Space' || !get().canMove) return; if (down && draw < 0 && !arrow) draw = time; else if (!down) release(); },
  };
}
