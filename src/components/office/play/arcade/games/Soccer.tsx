'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D } from '../kit/types';
import { useBoard } from '../kit/board';
import { Fx, TAU, ball, halo, label, rrect, scene, shape, star, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { buzz, sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { BR, DR, FH, FW, GOAL, MAX_FLICK, type Power, type SoccerMove, type SoccerState } from '../rules/soccer';

export { rules } from '../rules/soccer';

// The pitch, seen from one's own goal. A flick: press one of your discs, pull back and let go.

const OX = 14, OY = 34, W = FW + OX * 2, H = FH + OY * 2;
const ICON: Record<Power, string> = { fire: '🔥', big: '⭕', ice: '❄' };
type Props = BoardProps<SoccerState, SoccerMove>;

export default function Soccer(props: Props) {
  const { api, get } = useBoard(props);
  return <CanvasStage api={api} size={[W, H]} init={() => create(get)} />;
}

function create(get: () => Props): Game2D {
  const fx = new Fx();
  let prev = get().s, time = 0, grab = -1, pull: [number, number] = [0, 0], goalT = 0, lastKick = 0;
  let replay: { frames: number[][]; before: number[]; i: number; goal: number; seat: number } | null = null;
  // Seat 1 sees the pitch turned around, so everyone attacks upwards.
  const flip = () => get().seat === 1;
  const vx = (x: number) => OX + (flip() ? FW - x : x), vy = (y: number) => OY + (flip() ? FH - y : y);
  const positions = (): number[] => {
    if (!replay) { const s = get().s; return [...s.d, s.ball].flatMap((p) => [p.x, p.y]); }
    const f = replay.frames, i = Math.min(f.length - 1, Math.floor(replay.i)), k = Math.min(1, replay.i - i);
    const a = replay.i < 0 ? replay.before : f[i], b = f[Math.min(f.length - 1, i + 1)];
    return a.map((v, j) => v + (b[j] - v) * (replay!.i < 0 ? 0 : k));
  };

  return {
    step(dt) {
      time += dt; fx.step(dt); goalT = Math.max(0, goalT - dt);
      const s = get().s;
      if (s !== prev) {
        if (s.play && s.n !== prev.n) { replay = { frames: s.play.frames, before: s.play.before, i: 0, goal: s.play.goal, seat: s.play.seat }; sfx.hit(); }
        grab = -1; prev = s;
      }
      if (replay) {
        const before = positions();
        replay.i += dt * 20;
        const after = positions();
        // The ball changing direction sharply: a knock.
        const bx = after[20] - before[20], by = after[21] - before[21];
        if (Math.hypot(bx, by) > 3 && time - lastKick > 0.18) { lastKick = time; sfx.tick(); }
        if (replay.i >= replay.frames.length - 1) {
          if (replay.goal >= 0) { goalT = 1.8; const p = theme.get(); fx.confetti(W / 2, H / 2, [p.sun, p.coral, p.sky, p.mint], 60, 380); fx.shake(8, 0.4); sfx.win(); buzz(80); }
          replay = null;
        }
      }
    },
    draw(g, t) {
      const p = theme.get(), { s, seat, canMove, colors } = get();
      fx.begin(g);
      scene(g, W, H, t, p, false);
      // Goals (behind the lines), pitch and markings
      for (const top of [true, false]) {
        const owner = top !== flip() ? 1 : 0; // the seat defending this goal
        tile(g, p, OX + FW / 2 - GOAL / 2, top ? OY - 22 : OY + FH - 2, GOAL, 24, 6, colors[owner], 2, 0);
        label(g, p, String(s.score[1 - owner]), OX + FW / 2 + GOAL / 2 + 26, top ? OY - 14 : OY + FH + 15, 20, colors[1 - owner]);
      }
      tile(g, p, OX - 3, OY - 3, FW + 6, FH + 6, 10, p.dark ? '#27603f' : '#7fd08a', 2.5, 4);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 6; i += 2) g.fillRect(OX, OY + (i * FH) / 6, FW, FH / 6);
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(OX, OY + FH / 2); g.lineTo(OX + FW, OY + FH / 2); g.stroke();
      g.beginPath(); g.arc(OX + FW / 2, OY + FH / 2, 40, 0, TAU); g.stroke();
      for (const y of [OY, OY + FH]) { g.strokeRect(OX + FW / 2 - 70, y === OY ? y : y - 56, 140, 56); g.fillStyle = p.dark ? '#27603f' : '#7fd08a'; g.fillRect(OX + FW / 2 - GOAL / 2, y - 3, GOAL, 6); }
      const pos = positions(), live = canMove && !replay && goalT <= 0;
      // The power star
      if (s.star && !replay) { const x = vx(s.star.x), y = vy(s.star.y); halo(g, x, y, 26, p.sun, 0.5); shape(g, p, p.sun, () => star(g, x, y, 12, t), 2, 2); write(g, p, ICON[s.star.kind], x, y + 1, 9, 800); }
      // Discs
      for (let k = 0; k < 10; k++) {
        const owner = k < 5 ? 0 : 1, x = vx(pos[k * 2]), y = vy(pos[k * 2 + 1]);
        const big = replay && replay.seat === owner && s.play?.used === 'big' && k === s.play.seat * 5 + s.play.i;
        const iced = replay && s.play?.used === 'ice' && owner !== replay.seat;
        ball(g, p, x, y, big ? 22 : DR, iced ? '#bfe9ff' : colors[owner], 2, 3);
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, (big ? 22 : DR) * 0.55, 0, TAU); g.stroke();
        if (live && owner === seat && grab < 0) { g.strokeStyle = p.white; g.lineWidth = 2; g.setLineDash([4, 4]); g.lineDashOffset = -t * 12; g.beginPath(); g.arc(x, y, DR + 4, 0, TAU); g.stroke(); g.setLineDash([]); }
      }
      // Ball
      const bx = vx(pos[20]), by = vy(pos[21]);
      if (replay && s.play?.used === 'fire') halo(g, bx, by, 26, p.orange, 0.7);
      ball(g, p, bx, by, BR, p.white, 2, 2);
      g.fillStyle = p.ink; g.beginPath(); g.arc(bx, by, 3, 0, TAU); g.fill();
      // Aiming
      if (grab >= 0 && live) {
        const d = s.d[seat * 5 + grab], x = vx(d.x), y = vy(d.y), len = Math.min(120, Math.hypot(pull[0], pull[1]));
        if (len > 6) {
          const ux = -pull[0] / Math.hypot(pull[0], pull[1]), uy = -pull[1] / Math.hypot(pull[0], pull[1]), k = len / 120;
          g.strokeStyle = p.ink; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ux * (20 + len * 0.9), y + uy * (20 + len * 0.9)); g.stroke();
          g.strokeStyle = k > 0.8 ? p.coral : k > 0.45 ? p.sun : p.mint; g.lineWidth = 5; g.stroke();
          g.strokeStyle = p.text; g.globalAlpha = 0.4; g.lineWidth = 2; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + pull[0] * (len / Math.hypot(pull[0], pull[1])), y + pull[1] * (len / Math.hypot(pull[0], pull[1]))); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
        }
      }
      // Armed powers, in each team's corner
      s.power.forEach((pw, who) => {
        if (!pw) return;
        const mine = who === seat, x = OX + 24, y = mine ? OY + FH + 16 : OY - 16;
        tile(g, p, x - 18, y - 12, 36, 24, 12, colors[who], 2, 2); write(g, p, ICON[pw], x, y + 1, 13, 800);
        if (mine && live) write(g, p, get().t('armed'), x + 78, y + 1, 10, 700, p.soft, 110);
      });
      if (goalT > 0) { g.globalAlpha = Math.min(1, goalT); label(g, p, get().t('goal'), W / 2, H / 2, 46 + Math.sin(t * 12) * 3, p.sun); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    pointer(e) {
      const { s, seat, canMove, move } = get();
      if (!canMove || replay || goalT > 0) { grab = -1; return; }
      if (e.type === 'down') {
        grab = -1;
        let best = DR + 14;
        for (let i = 0; i < 5; i++) { const d = s.d[seat * 5 + i], dist = Math.hypot(e.x - vx(d.x), e.y - vy(d.y)); if (dist < best) { best = dist; grab = i; } }
        pull = [0, 0];
        if (grab >= 0) sfx.tick();
      } else if (grab >= 0) {
        const d = s.d[seat * 5 + grab];
        pull = [e.x - vx(d.x), e.y - vy(d.y)];
        if (e.type === 'up') {
          const len = Math.hypot(pull[0], pull[1]);
          if (len > 10) { const sp = (Math.min(120, len) / 120) * MAX_FLICK, sign = flip() ? 1 : -1; move({ i: grab, vx: (pull[0] / len) * sp * sign, vy: (pull[1] / len) * sp * sign }); }
          grab = -1;
        }
      }
    },
  };
}
