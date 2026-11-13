'use client';
import { DuelStage, type Control, type DuelSim, type Pt } from '../kit/duel';
import { Fx, label, write } from '../kit/fx';
import type { World } from '../kit/World';
import { clamp } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';
import type { RtProps } from '../VersusShell';

// Turbo Hockey: air hockey with powers. Seat 0 defends the bottom goal, seat 1 the top one; a mallet stays
// in its own half. Orbs appear in the middle; when the puck touches one, whoever hit the puck last gets
// its power: a blazing puck, the rival frozen, a shield over one's goal, a giant mallet or a ghost puck.
// First to seven goals.

const W = 300, H = 500, GOAL = 112, PR = 13, MR = 23, WIN = 7;
type Kind = 'fire' | 'ice' | 'shield' | 'giant' | 'ghost';
const KINDS: Kind[] = ['fire', 'ice', 'shield', 'giant', 'ghost'];
const ICON: Record<Kind, string> = { fire: '🔥', ice: '❄', shield: '🛡', giant: '⭕', ghost: '👻' };

export default function Hockey(rt: RtProps) {
  return <DuelStage rt={rt} size={[W, H]} make={(fx) => createSim(fx, (k) => rt.t(k))} control={control} />;
}
function control(c: Control, seat: number, last: Pt, dt: number): Pt {
  if (c.pointer) return c.pointer;
  const sp = 520 * dt;
  return { x: clamp(last.x + ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * sp, 0, W), y: clamp(last.y + ((c.down ? 1 : 0) - (c.up ? 1 : 0)) * sp, 0, H) };
}

function createSim(fx: Fx, t: (k: string) => string): DuelSim {
  const puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  const m = [{ x: W / 2, y: H - 70, vx: 0, vy: 0 }, { x: W / 2, y: 70, vx: 0, vy: 0 }];
  const score = [0, 0], ice = [0, 0], shield = [0, 0], giant = [0, 0];
  let proj: World['to2d'] = (x, y) => [x, y];
  let pause = 1, fire = 0, ghost = 0, lastHit = -1, orb: { x: number; y: number; kind: Kind } | null = null, orbIn = 5, goalFlash = 0, hits = 0, seenHits = 0, seenGoals = 0;
  const radius = (seat: number) => (giant[seat] > 0 ? 34 : MR);
  const kick = (to: number) => { puck.x = W / 2; puck.y = H / 2 + (to === 0 ? 70 : -70); puck.vx = 0; puck.vy = 0; pause = 1; lastHit = -1; fire = 0; ghost = 0; };
  const grant = (kind: Kind, to: number) => {
    if (kind === 'fire') { fire = 3.2; const sp = Math.hypot(puck.vx, puck.vy) || 1, k = Math.max(820, sp * 1.5) / sp; puck.vx *= k; puck.vy *= k; }
    else if (kind === 'ice') ice[1 - to] = 2.2; else if (kind === 'shield') shield[to] = 7; else if (kind === 'giant') giant[to] = 8; else ghost = 3.5;
  };
  const effects = () => {
    // Sounds and sparks come from counters, so the guest (who only receives the state) gets them too.
    if (hits !== seenHits) { seenHits = hits; sfx.place(); fx.pop(...proj(puck.x, puck.y, 6), '#ffffff', 18); }
    if (score[0] + score[1] !== seenGoals) { seenGoals = score[0] + score[1]; goalFlash = 1.4; sfx.great(); buzz(60); fx.shake(8, 0.4); }
  };
  return {
    step(dt, inputs, auth) {
      goalFlash = Math.max(0, goalFlash - dt);
      for (const s of [0, 1]) {
        const target = inputs[s], me = m[s], r = radius(s);
        ice[s] = Math.max(0, ice[s] - dt); shield[s] = Math.max(0, shield[s] - dt); giant[s] = Math.max(0, giant[s] - dt);
        if (!target || ice[s] > 0) { me.vx = 0; me.vy = 0; continue; }
        const tx = clamp(target.x, r, W - r), ty = s === 0 ? clamp(target.y, H / 2 + r, H - r) : clamp(target.y, r, H / 2 - r);
        const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy), step = Math.min(d, 1300 * dt);
        const nx = d ? (dx / d) * step : 0, ny = d ? (dy / d) * step : 0;
        me.x += nx; me.y += ny; me.vx = nx / dt; me.vy = ny / dt;
      }
      fire = Math.max(0, fire - dt); ghost = Math.max(0, ghost - dt);
      if (pause > 0) { pause -= dt; effects(); return; }
      const speed = Math.hypot(puck.vx, puck.vy), steps = Math.max(1, Math.ceil((speed * dt) / 4));
      for (let i = 0; i < steps; i++) {
        puck.x += (puck.vx * dt) / steps; puck.y += (puck.vy * dt) / steps;
        if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx) * 0.95; } else if (puck.x > W - PR) { puck.x = W - PR; puck.vx = -Math.abs(puck.vx) * 0.95; }
        const mouth = Math.abs(puck.x - W / 2) < GOAL / 2 - PR * 0.5;
        if (puck.y < PR && !(mouth && shield[1] <= 0)) { puck.y = PR; puck.vy = Math.abs(puck.vy) * 0.95; }
        if (puck.y > H - PR && !(mouth && shield[0] <= 0)) { puck.y = H - PR; puck.vy = -Math.abs(puck.vy) * 0.95; }
        if (puck.y < -PR || puck.y > H + PR) {
          if (auth) { const scorer = puck.y < 0 ? 0 : 1; score[scorer]++; kick(1 - scorer); } else { puck.vx = 0; puck.vy = 0; puck.y = clamp(puck.y, -PR, H + PR); }
          break;
        }
        for (const s of [0, 1]) {
          const me = m[s], r = radius(s), dx = puck.x - me.x, dy = puck.y - me.y, d = Math.hypot(dx, dy) || 0.001;
          if (d >= r + PR) continue;
          const nx = dx / d, ny = dy / d;
          puck.x = me.x + nx * (r + PR + 0.5); puck.y = me.y + ny * (r + PR + 0.5);
          const rel = (puck.vx - me.vx) * nx + (puck.vy - me.vy) * ny;
          if (rel < 0) { puck.vx -= 1.85 * rel * nx; puck.vy -= 1.85 * rel * ny; }
          if (puck.vx * nx + puck.vy * ny < 120) { puck.vx += nx * 120; puck.vy += ny * 120; }
          lastHit = s; hits++;
        }
      }
      const cap = fire > 0 ? 1250 : 900, sp = Math.hypot(puck.vx, puck.vy);
      if (sp > cap) { puck.vx *= cap / sp; puck.vy *= cap / sp; }
      if (fire <= 0) { const f = Math.exp(-0.32 * dt); puck.vx *= f; puck.vy *= f; }
      if (auth) {
        if (!orb) { orbIn -= dt; if (orbIn <= 0) orb = { x: 44 + Math.random() * (W - 88), y: H / 2 - 80 + Math.random() * 160, kind: KINDS[Math.floor(Math.random() * KINDS.length)] }; }
        else if (lastHit >= 0 && Math.hypot(puck.x - orb.x, puck.y - orb.y) < PR + 16) { grant(orb.kind, lastHit); orb = null; orbIn = 6 + Math.random() * 4; hits++; }
      }
      effects();
    },
    snap: () => ({ p: [puck.x, puck.y, puck.vx, puck.vy].map(Math.round), m: m.map((a) => [Math.round(a.x), Math.round(a.y)]), sc: score, t: [ice, shield, giant].map((a) => a.map((v) => Math.round(v * 10))), f: [Math.round(fire * 10), Math.round(ghost * 10), Math.round(pause * 10)], o: orb ? [orb.x, orb.y, KINDS.indexOf(orb.kind)].map(Math.round) : null, h: hits, l: lastHit }),
    load(raw, me) {
      const s = raw as { p: number[]; m: number[][]; sc: number[]; t: number[][]; f: number[]; o: number[] | null; h: number; l: number };
      // The state as the host saw it a moment ago; a small difference is eased in, a big one taken at once.
      const dx = s.p[0] - puck.x, dy = s.p[1] - puck.y, near = Math.hypot(dx, dy) < 40;
      puck.x += dx * (near ? 0.4 : 1); puck.y += dy * (near ? 0.4 : 1); puck.vx = s.p[2]; puck.vy = s.p[3];
      // Only the other player's mallet comes from the host: one's own follows the finger at once.
      m.forEach((a, i) => { if (i !== me) { a.x += (s.m[i][0] - a.x) * 0.5; a.y += (s.m[i][1] - a.y) * 0.5; } });
      score[0] = s.sc[0]; score[1] = s.sc[1];
      [ice, shield, giant].forEach((a, i) => { a[0] = s.t[i][0] / 10; a[1] = s.t[i][1] / 10; });
      fire = s.f[0] / 10; ghost = s.f[1] / 10; pause = s.f[2] / 10;
      orb = s.o ? { x: s.o[0], y: s.o[1], kind: KINDS[s.o[2]] ?? 'fire' } : null;
      hits = s.h; lastHit = s.l;
    },
    bot(seat, dt) {
      // Guards its goal, and goes for the puck when it is in its half and not too fast.
      const me = m[seat], home = seat === 0 ? H - 64 : 64, mineHalf = seat === 0 ? puck.y > H / 2 - 10 : puck.y < H / 2 + 10;
      const coming = seat === 0 ? puck.vy > 40 : puck.vy < -40;
      let tx = W / 2 + (puck.x - W / 2) * 0.55, ty = home;
      if (mineHalf && Math.hypot(puck.vx, puck.vy) < 620) { tx = puck.x + (puck.x - W / 2) * 0.1; ty = puck.y + (seat === 0 ? 12 : -12); }
      else if (coming) tx = clamp(puck.x + puck.vx * 0.18, 30, W - 30);
      const k = Math.min(1, dt * 6.5);
      return { x: me.x + (tx - me.x) * k, y: me.y + (ty - me.y) * k };
    },
    render(w, t, _names, colors) {
      const p = w.pal, line = p.dark ? '#5a4f85' : '#d9cfbd', wall = p.dark ? '#4a3f78' : '#f0e2c8';
      proj = w.to2d;
      // Rink, its low walls (open at the goals) and the markings
      w.box(W / 2, H / 2, W, H, 4, p.paper, { z: -4 });
      for (const sx of [-6, W + 6]) w.box(sx, H / 2, 12, H + 24, 18, wall);
      for (const s of [0, 1]) {
        const y = s === 0 ? H + 6 : -6;
        for (const side of [-1, 1]) w.box(W / 2 + side * (GOAL / 2 + (W - GOAL) / 4), y, (W - GOAL) / 2, 12, 18, wall);
        w.box(W / 2, y + (s === 0 ? 12 : -12), GOAL + 8, 14, 22, colors[s]); // the goal's back
        w.disc(W / 2, s === 0 ? H : 0, 74, 0.6, line);
        w.disc(W / 2, s === 0 ? H : 0, 70, 0.8, p.paper);
        if (shield[s] > 0) w.box(W / 2, s === 0 ? H - 6 : 6, GOAL, 5, 16 + Math.sin(t * 9) * 3, p.sky);
      }
      w.box(W / 2, H / 2, W, 3, 0.8, line);
      w.disc(W / 2, H / 2, 46, 0.6, line); w.disc(W / 2, H / 2, 42, 0.8, p.paper);
      if (orb) { const bob = 10 + Math.sin(t * 5) * 4; w.disc(orb.x, orb.y, 15, 0.6, p.dark ? '#00000055' : '#00000022'); w.ball(orb.x, orb.y, 14, p.sun, bob); }
      // Puck (hidden while it is a ghost, but for a shimmer now and then)
      if (ghost <= 0 || Math.sin(t * 9) > 0.86) w.disc(puck.x, puck.y, PR, 7, fire > 0 ? p.orange : p.dark ? '#f4f0ff' : '#2b2440');
      if (fire > 0) w.ball(puck.x, puck.y, 6 + Math.sin(t * 30) * 2, p.sun, 8);
      // Mallets: a wide base and a knob
      for (const s of [0, 1]) {
        const r = radius(s), c = ice[s] > 0 ? '#bfe9ff' : colors[s];
        w.disc(m[s].x, m[s].y, r, 9, c);
        w.disc(m[s].x, m[s].y, r * 0.55, 12, p.dark ? '#0e0a1c' : '#2b2440', 9);
        w.ball(m[s].x, m[s].y, r * 0.45, c, 16);
      }
    },
    hud(g, w, t, names, colors) {
      const p = w.pal;
      for (const s of [0, 1]) {
        const [x, y] = w.to2d(W / 2, s === 0 ? H * 0.74 : H * 0.26);
        g.globalAlpha = 0.9; label(g, p, String(score[s]), x, y, 34 * Math.min(1.6, Math.max(0.7, w.scale)), colors[s]); g.globalAlpha = 1;
        const [nx, ny] = w.to2d(W / 2, s === 0 ? H * 0.9 : H * 0.1);
        write(g, p, names[s], nx, ny, 12, 700, p.soft, 160);
        if (ice[s] > 0) { const [ix, iy] = w.to2d(m[s].x, m[s].y, 30); write(g, p, '❄', ix, iy, 22, 800); }
      }
      if (orb) { const [ox, oy] = w.to2d(orb.x, orb.y, 26); write(g, p, ICON[orb.kind], ox, oy, 16, 800); }
      const [cx, cy] = w.to2d(W / 2, H / 2, 10);
      if (goalFlash > 0) { g.globalAlpha = Math.min(1, goalFlash); label(g, p, t0(t), cx, cy, 46, p.sun); g.globalAlpha = 1; }
      else if (pause > 0 && score[0] + score[1] === 0) label(g, p, String(Math.ceil(pause * 3)), cx, cy, 42, p.white);
    },
    winner: () => (score[0] >= WIN ? 0 : score[1] >= WIN ? 1 : -1),
  };
  function t0(_time: number) { return t('goal'); }
}
