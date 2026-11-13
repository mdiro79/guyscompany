'use client';
import { WorldStage, type Game3 } from '../kit/World';
import type { GameApi } from '../kit/types';
import { TableFx, hsl, label, write } from '../kit/fx';
import { clamp, rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Brick Pop. A paddle, a ball and a wall of candy-coloured bricks; clearing the wall brings the next,
// harder one. Hits in a row without touching the paddle multiply the points. Dark bricks take two
// hits, bomb bricks take their neighbours with them, and some bricks drop a helper: a wide paddle,
// extra balls, a slow ball or a life. Three lives.

const W = 360, H = 600, COLS = 8, BW = 40, BH = 18, GAP = 4, LEFT = 6, TOP = 54, PY = 556, R = 6;
type Kind = 1 | 2 | 3; // normal, strong, bomb
interface Brick { c: number; r: number; kind: Kind; hp: number; hue: number }
interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean }
interface Drop { x: number; y: number; kind: 'W' | 'M' | 'S' | 'L' }
const DROP_COLOR: Record<Drop['kind'], string> = { W: '#4aa8ff', M: '#ffc93c', S: '#3ccf91', L: '#ff7eb6' };
const DROP_ICON: Record<Drop['kind'], string> = { W: '↔', M: '⁂', S: '◷', L: '♥' };

export default function Breaker({ api }: { api: GameApi }) {
  return <WorldStage api={api} size={[W, H]} init={(w) => { w.tilt = 0.22; return create(api); }} />;
}

function create(api: GameApi): Game3 {
  const r = rng(api.seed), fx = new TableFx();
  let bricks: Brick[] = [], balls: Ball[] = [], drops: Drop[] = [];
  let px = W / 2, level = 0, lives = 3, score = 0, combo = 0, wide = 0, slow = 0, over = 0, ended = false, banner = 0;
  const keys = { left: false, right: false };
  const pw = () => (wide > 0 ? 104 : 66);
  const speed = () => Math.min(520, 290 + level * 14) * (slow > 0 ? 0.68 : 1);
  const hud = () => api.hud(`${'♥'.repeat(Math.max(0, lives))} · ${api.t('level', { n: level })}`);

  const rowsFor = (lv: number) => Math.min(9, 4 + Math.floor(lv / 2));
  const build = () => {
    level++;
    bricks = [];
    const rows = rowsFor(level), shape = (level - 1) % 5, hue0 = Math.floor(r() * 360);
    for (let row = 0; row < rows; row++) for (let c = 0; c < COLS; c++) {
      const m = Math.min(c, COLS - 1 - c);
      const on = shape === 0 ? true : shape === 1 ? (row + c) % 2 === 0 : shape === 2 ? m >= Math.max(0, 3 - row) || row > 3 : shape === 3 ? c % 3 !== 1 : Math.abs(m - 1.5) + Math.abs(row - (rows - 1) / 2) < rows / 2 + 1.2;
      if (!on) continue;
      const k = r();
      const kind: Kind = k < 0.06 ? 3 : k < Math.min(0.5, 0.1 + level * 0.05) ? 2 : 1;
      bricks.push({ c, r: row, kind, hp: kind === 2 ? 2 : 1, hue: hue0 + row * 26 });
    }
    if (bricks.length < 8) for (let c = 0; c < COLS; c++) if (!bricks.some((b) => b.r === 0 && b.c === c)) bricks.push({ c, r: 0, kind: 1, hp: 1, hue: hue0 });
    balls = [{ x: px, y: PY - R - 1, vx: 0, vy: 0, stuck: true }];
    drops = [];
    banner = 1.6;
    hud();
  };
  const brickRect = (b: Brick) => [LEFT + b.c * (BW + GAP), TOP + b.r * (BH + GAP)] as const;

  const smash = (b: Brick, chain = false) => {
    const i = bricks.indexOf(b);
    if (i < 0) return;
    b.hp--;
    const [bx, by] = brickRect(b), cx = bx + BW / 2, cy = by + BH / 2;
    if (b.hp > 0) { fx.pop(cx, cy, '#ffffff', 14); sfx.tick(); return; }
    bricks.splice(i, 1);
    combo++;
    const pts = 10 * Math.min(8, combo) * (b.kind === 2 ? 2 : 1);
    score += pts;
    fx.confetti(cx, cy, [hsl(b.hue, 78, 64), '#ffffff'], 7, 160);
    if (combo > 2 && !chain) fx.text(cx, cy, `+${pts}`, '#ffc93c', 13);
    sfx.point(combo);
    if (b.kind === 3) {
      fx.burst(cx, cy, '#ff9f43', 20, 240, 4, 0.6); fx.pop(cx, cy, '#ff9f43', 46); fx.shake(6, 0.25); sfx.boom(); buzz(30);
      for (const n of bricks.filter((o) => Math.abs(o.c - b.c) <= 1 && Math.abs(o.r - b.r) <= 1)) { n.hp = 1; smash(n, true); }
    } else if (r() < 0.15 && drops.length < 4) {
      const k = r();
      drops.push({ x: cx, y: cy, kind: k < 0.08 ? 'L' : k < 0.4 ? 'W' : k < 0.72 ? 'M' : 'S' });
    }
    api.score(score);
  };

  const launch = () => {
    for (const b of balls) if (b.stuck) { const a = (r() - 0.5) * 0.7; b.vx = Math.sin(a); b.vy = -Math.cos(a); b.stuck = false; sfx.move(); }
  };

  const moveBall = (b: Ball, dist: number) => {
    // Small steps, so a fast ball never passes through a brick.
    for (let left = dist; left > 0; left -= 3) {
      const d = Math.min(3, left);
      b.x += b.vx * d; b.y += b.vy * d;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); } else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
      // Paddle: where the ball lands decides the angle it leaves at.
      const half = pw() / 2;
      if (b.vy > 0 && b.y + R >= PY && b.y - R <= PY + 10 && b.x > px - half - R && b.x < px + half + R) {
        const a = clamp((b.x - px) / half, -1, 1) * 1.05;
        b.vx = Math.sin(a); b.vy = -Math.cos(a); b.y = PY - R;
        combo = 0; sfx.move();
        fx.pop(b.x, PY, '#ffffff', 10);
      }
      for (const k of bricks) {
        const [bx, by] = brickRect(k);
        const nx = clamp(b.x, bx, bx + BW), ny = clamp(b.y, by, by + BH), dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy > R * R) continue;
        // Bounce off the side that was hit (the smaller overlap).
        const ox = Math.min(b.x + R - bx, bx + BW - (b.x - R)), oy = Math.min(b.y + R - by, by + BH - (b.y - R));
        if (ox < oy) b.vx = b.x < bx + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
        else b.vy = b.y < by + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
        smash(k);
        break;
      }
      // Never a ball that only goes sideways.
      if (Math.abs(b.vy) < 0.22) { b.vy = (b.vy < 0 ? -1 : 1) * 0.22; const n = Math.hypot(b.vx, b.vy); b.vx /= n; b.vy /= n; }
    }
  };

  build();
  return {
    step(dt) {
      fx.step(dt);
      banner = Math.max(0, banner - dt);
      if (over) { over += dt; if (over > 1.2 && !ended) { ended = true; api.end(score); } return; }
      wide = Math.max(0, wide - dt); slow = Math.max(0, slow - dt);
      if (keys.left) px -= 430 * dt;
      if (keys.right) px += 430 * dt;
      px = clamp(px, pw() / 2, W - pw() / 2);
      for (const b of balls) {
        if (b.stuck) { b.x = px; b.y = PY - R - 1; } else moveBall(b, speed() * dt);
      }
      balls = balls.filter((b) => b.y < H + 20);
      for (const d of drops) d.y += 150 * dt;
      drops = drops.filter((d) => {
        if (d.y > PY - 8 && d.y < PY + 14 && Math.abs(d.x - px) < pw() / 2 + 8) {
          if (d.kind === 'W') wide = 12;
          else if (d.kind === 'S') slow = 8;
          else if (d.kind === 'L') { lives = Math.min(5, lives + 1); hud(); }
          else for (const b of balls.filter((x) => !x.stuck).slice(0, 2)) for (const s of [-0.5, 0.5]) if (balls.length < 6) { const a = Math.atan2(b.vx, -b.vy) + s; balls.push({ x: b.x, y: b.y, vx: Math.sin(a), vy: -Math.cos(a), stuck: false }); }
          fx.pop(d.x, PY, DROP_COLOR[d.kind], 30); fx.text(d.x, PY - 18, DROP_ICON[d.kind], DROP_COLOR[d.kind], 20);
          sfx.good(); buzz(15); score += 25; api.score(score);
          return false;
        }
        return d.y < H + 20;
      });
      if (!balls.length) {
        lives--; combo = 0; wide = 0; slow = 0;
        sfx.bad(); buzz(60); fx.shake(7, 0.3); fx.blink('#ff6b5e', 0.4);
        hud();
        if (lives <= 0) { over = 0.0001; sfx.boom(); return; }
        balls = [{ x: px, y: PY - R - 1, vx: 0, vy: 0, stuck: true }];
      }
      if (!bricks.length) {
        score += 100 * level; api.score(score);
        fx.confetti(W / 2, H / 2, ['#ffc93c', '#3ccf91', '#4aa8ff', '#ff7eb6'], 50, 360); sfx.great();
        build();
      }
    },
    render(w, t) {
      const p = w.pal;
      fx.proj = w.to2d;
      w.box(W / 2, H / 2, W, H, 4, p.paper, { z: -4 });
      const rim = p.dark ? '#4a3f78' : '#f0e2c8';
      for (const x of [-5, W + 5]) w.box(x, H / 2, 10, H + 20, 14, rim);
      w.box(W / 2, -5, W + 20, 10, 14, rim);
      // A dashed line where the paddle lives
      for (let i = 0; i < 12; i++) w.box(15 + i * 30, PY + 24, 14, 1.5, 0.3, p.line.startsWith('rgba') ? (p.dark ? '#5a4f85' : '#e2d6c2') : p.line);
      for (const b of bricks) {
        const [x, y] = brickRect(b), strong = b.kind === 2 && b.hp === 2;
        const color = b.kind === 3 ? p.orange : hsl(b.hue, 78, strong ? 48 : 64);
        w.box(x + BW / 2, y + BH / 2, BW - 1.5, BH - 1.5, strong ? 16 : 11, color);
        if (b.kind === 3) w.ball(x + BW / 2, y + BH / 2, 5, p.dark ? '#0e0a1c' : '#2b2440', 11);
      }
      for (const d of drops) w.ball(d.x, d.y, 9, DROP_COLOR[d.kind], 5 + Math.sin(t * 6 + d.x) * 2);
      const pw2 = pw();
      w.box(px, PY + 5, pw2, 11, 10, wide > 0 ? p.sky : p.coral);
      w.box(px, PY + 3, pw2 - 8, 3, 2, '#ffffff', { z: 10 });
      for (const b of balls) w.ball(b.x, b.y, R + 1, slow > 0 ? p.mint : p.sun, 1);
    },
    hud(g, w, t) {
      const p = w.pal;
      fx.begin(g);
      for (const d of drops) { const [x, y] = w.to2d(d.x, d.y, 26); write(g, p, DROP_ICON[d.kind], x, y, 14, 800, p.text); }
      if (balls.some((b) => b.stuck) && !over && Math.floor(t * 2) % 2 === 0) { const [x, y] = w.to2d(W / 2, PY - 70, 0); label(g, p, api.t('launch'), x, y, 15, p.white, 300); }
      if (banner > 0) { const [x, y] = w.to2d(W / 2, H / 2 + 40, 20); g.globalAlpha = Math.min(1, banner); label(g, p, api.t('level', { n: level }), x, y, 32, p.sun); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    pointer(p) { if (p.type !== 'up') px = clamp(p.x, pw() / 2, W - pw() / 2); },
    tap() { launch(); },
    key(code, down) {
      if (code === 'ArrowLeft' || code === 'KeyA') keys.left = down;
      else if (code === 'ArrowRight' || code === 'KeyD') keys.right = down;
      else if (down && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) launch();
    },
  };
}
