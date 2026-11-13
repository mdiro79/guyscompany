'use client';
import { WorldStage, type Game3 } from '../kit/World';
import { seatPills, useBoard } from '../kit/board';
import { Fx, label, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { buzz, sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { BR, DR, FH, FW, GOAL, MAX_FLICK, type Power, type SoccerMove, type SoccerState } from '../rules/soccer';

export { rules } from '../rules/soccer';

// Flick Soccer on a little 3D pitch, seen from one's own goal. A flick: press one of your discs, pull
// back and let go; an arrow shows the direction and the strength while pulling.

const ICON: Record<Power, string> = { fire: '🔥', big: '⭕', ice: '❄' };
type Props = BoardProps<SoccerState, SoccerMove>;

export default function Soccer(props: Props) {
  const { api, get } = useBoard(props);
  return <WorldStage api={api} size={[FW, FH]} init={(w) => { w.tilt = 0.55; w.spin = props.seat === 1 ? Math.PI : 0; return create(get); }} />;
}

function create(get: () => Props): Game3 {
  const fx = new Fx();
  let prev = get().s, time = 0, grab = -1, pull: [number, number] = [0, 0], goalT = 0, lastKick = 0;
  let proj: (x: number, y: number, z?: number) => [number, number] = (x, y) => [x, y];
  let replay: { frames: number[][]; before: number[]; i: number; goal: number; seat: number } | null = null;
  const positions = (): number[] => {
    if (!replay) { const s = get().s; return [...s.d, s.ball].flatMap((p) => [p.x, p.y]); }
    const f = replay.frames, i = Math.min(f.length - 1, Math.floor(replay.i)), k = Math.min(1, replay.i - i);
    const a = f[i], b = f[Math.min(f.length - 1, i + 1)];
    return a.map((v, j) => v + (b[j] - v) * k);
  };
  return {
    step(dt) {
      time += dt; fx.step(dt); goalT = Math.max(0, goalT - dt);
      const s = get().s;
      if (s !== prev) {
        if (s.play && s.n !== prev.n) { replay = { frames: s.play.frames, before: s.play.before, i: 0, goal: s.play.goal, seat: s.play.seat }; sfx.hit(); }
        grab = -1; prev = s;
      }
      if (!replay) return;
      const before = positions();
      replay.i += dt * 20;
      const after = positions();
      if (Math.hypot(after[20] - before[20], after[21] - before[21]) > 3 && time - lastKick > 0.18) { lastKick = time; sfx.tick(); }
      if (replay.i >= replay.frames.length - 1) {
        if (replay.goal >= 0) { goalT = 1.8; const p = theme.get(); fx.confetti(...proj(FW / 2, FH / 2, 20), [p.sun, p.coral, p.sky, p.mint], 70, 420); fx.shake(8, 0.4); sfx.win(); buzz(80); }
        replay = null;
      }
    },
    render(w, t) {
      const p = w.pal, { s, seat, canMove, colors } = get();
      proj = w.to2d;
      const grass = p.dark ? '#2f7a55' : '#6cc47c', grass2 = p.dark ? '#2a6e4c' : '#62b872', line = '#ffffff';
      // Pitch with stripes, a low wall around it (open at the goals), markings and two goals.
      for (let i = 0; i < 8; i++) w.box(FW / 2, (i + 0.5) * (FH / 8), FW, FH / 8, 3, i % 2 ? grass : grass2, { z: -3 });
      const wall = p.dark ? '#4a3f78' : '#f0e2c8';
      for (const x of [-5, FW + 5]) w.box(x, FH / 2, 10, FH + 20, 12, wall);
      for (const y of [-5, FH + 5]) for (const s2 of [-1, 1]) w.box(FW / 2 + s2 * (GOAL / 2 + (FW - GOAL) / 4 + 2.5), y, (FW - GOAL) / 2 - 5, 10, 12, wall);
      w.box(FW / 2, FH / 2, FW - 16, 2, 0.3, line);
      w.disc(FW / 2, FH / 2, 42, 0.3, line); w.disc(FW / 2, FH / 2, 40, 0.4, grass);
      for (const y of [0, FH]) {
        const inward = y === 0 ? 1 : -1;
        w.box(FW / 2, y + inward * 56, 140, 2, 0.3, line);
        for (const s2 of [-1, 1]) w.box(FW / 2 + s2 * 70, y + inward * 28, 2, 56, 0.3, line);
        // Goal: posts, crossbar and a net box behind the line, in the defending team's colour.
        const owner = y === 0 ? 1 : 0, back = y - inward * 18;
        for (const s2 of [-1, 1]) w.box(FW / 2 + s2 * (GOAL / 2), y - inward * 9, 5, 18, 28, colors[owner]);
        w.box(FW / 2, back, GOAL + 5, 4, 28, colors[owner]);
        w.box(FW / 2, y - inward * 9, GOAL + 5, 18, 3, colors[owner], { z: 26 });
      }
      const pos = positions(), live = canMove && !replay && goalT <= 0;
      if (s.star && !replay) w.ball(s.star.x, s.star.y, 9, p.sun, 8 + Math.sin(t * 4) * 3);
      for (let k = 0; k < 10; k++) {
        const owner = k < 5 ? 0 : 1, x = pos[k * 2], y = pos[k * 2 + 1];
        const big = replay && s.play?.used === 'big' && replay.seat === owner && k === s.play.seat * 5 + s.play.i;
        const iced = replay && s.play?.used === 'ice' && owner !== replay.seat;
        const r = big ? 22 : DR, lift = live && owner === seat && k - seat * 5 === grab ? 3 : 0;
        if (live && owner === seat && grab < 0) w.disc(x, y, r + 3 + Math.sin(t * 5) * 0.8, 0.3, p.white, 0.05);
        w.disc(x, y, r, 7, iced ? '#bfe9ff' : colors[owner], lift);
        w.disc(x, y, r * 0.55, 1.2, '#ffffff', lift + 7);
        w.disc(x, y, r * 0.42, 1.4, iced ? '#bfe9ff' : colors[owner], lift + 7);
      }
      const fire = replay && s.play?.used === 'fire';
      w.ball(pos[20], pos[21], BR, fire ? p.orange : '#ffffff', 0);
      if (fire) w.ball(pos[20], pos[21], BR * 0.6, p.sun, BR * 1.6);
      // Aim: an arrow of blocks from the disc the way it will go, longer and redder the harder the pull.
      if (grab >= 0 && live) {
        const d = s.d[seat * 5 + grab], len = Math.min(120, Math.hypot(pull[0], pull[1]));
        if (len > 6) {
          const ux = -pull[0] / Math.hypot(pull[0], pull[1]), uy = -pull[1] / Math.hypot(pull[0], pull[1]), k = len / 120;
          const c = k > 0.8 ? p.coral : k > 0.45 ? p.sun : p.mint, n = Math.max(2, Math.round(len / 12));
          for (let i = 1; i <= n; i++) { const dd = DR + 4 + i * 10; w.box(d.x + ux * dd, d.y + uy * dd, 6, 6 - i * 0.2, 2, c, { rot: Math.atan2(uy, ux), z: 1 }); }
          w.cone(d.x + ux * (DR + 12 + n * 10), d.y + uy * (DR + 12 + n * 10), 6, 12, c, { flat: true, rot: Math.atan2(uy, ux), z: 0 });
        }
      }
    },
    hud(g, w, t) {
      const p = w.pal, { s, seat, canMove, colors, names } = get();
      fx.begin(g);
      seatPills(g, p, [0, 1].map((i) => ({ name: names[i], value: String(s.score[i]), color: colors[i], active: s.turn === i })));
      if (s.star && !replay) { const [x, y] = w.to2d(s.star.x, s.star.y, 30); write(g, p, ICON[s.star.kind], x, y, 15, 800); }
      const mine = s.power[seat];
      if (mine && canMove) { const W = g.canvas.clientWidth, H = g.canvas.clientHeight; tile(g, p, W / 2 - 90, H - 44, 180, 32, 16, colors[seat], 2, 3); write(g, p, `${ICON[mine]} ${get().t('armed')}`, W / 2, H - 28, 13, 800, '#2b2440', 170); }
      if (goalT > 0) { const [x, y] = w.to2d(FW / 2, FH / 2, 20); g.globalAlpha = Math.min(1, goalT); label(g, p, get().t('goal'), x, y, 50 + Math.sin(t * 12) * 3, p.sun); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    pointer(e) {
      const { s, seat, canMove, move } = get();
      if (!canMove || replay || goalT > 0) { grab = -1; return; }
      if (e.type === 'down') {
        grab = -1;
        let best = DR + 16;
        for (let i = 0; i < 5; i++) { const d = s.d[seat * 5 + i], dist = Math.hypot(e.x - d.x, e.y - d.y); if (dist < best) { best = dist; grab = i; } }
        pull = [0, 0];
        if (grab >= 0) sfx.tick();
      } else if (grab >= 0) {
        const d = s.d[seat * 5 + grab];
        pull = [e.x - d.x, e.y - d.y];
        if (e.type === 'up') {
          const len = Math.hypot(pull[0], pull[1]);
          if (len > 10) { const sp = (Math.min(120, len) / 120) * MAX_FLICK; move({ i: grab, vx: (-pull[0] / len) * sp, vy: (-pull[1] / len) * sp }); }
          grab = -1;
        }
      }
    },
  };
}
