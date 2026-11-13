'use client';
import { DuelStage, type Control, type DuelSim, type Pt } from '../kit/duel';
import { Fx, label, write } from '../kit/fx';
import { seatPills } from '../kit/board';
import type { World } from '../kit/World';
import { clamp } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';
import type { RtProps } from '../VersusShell';

// Wizard Pong: the classic rally with magic. Paddles slide along their own end; the ball speeds up with
// every return and leaves the paddle at a sharper angle the nearer the edge it was hit. A ball that gets
// past a paddle is a point for the other side. Orbs in the middle give whoever hit the ball last a
// power: giant paddle, fire shot (the next return is much faster), three balls, the rival slowed, a
// curving ball, the rival's paddle shrunk. First to seven.

const W = 300, H = 500, PY = 34, BR = 8, WIN = 7;
type Kind = 'giant' | 'fire' | 'multi' | 'ice' | 'curve' | 'shrink';
const KINDS: Kind[] = ['giant', 'fire', 'multi', 'ice', 'curve', 'shrink'];
const ICON: Record<Kind, string> = { giant: '⭕', fire: '🔥', multi: '⁂', ice: '❄', curve: '🌀', shrink: '🔻' };
interface Ball { x: number; y: number; vx: number; vy: number; sp: number; curve: number; hot: boolean; last: number }

export default function Pong(rt: RtProps) {
  return <DuelStage rt={rt} size={[W, H]} make={(fx) => createSim(fx, (k) => rt.t(k))} control={control} />;
}
function control(c: Control, _seat: number, last: Pt, dt: number): Pt {
  if (c.pointer) return { x: c.pointer.x, y: last.y };
  return { x: clamp(last.x + ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * 520 * dt, 0, W), y: last.y };
}

function createSim(fx: Fx, t: (k: string) => string): DuelSim {
  const px = [W / 2, W / 2], score = [0, 0], giant = [0, 0], slow = [0, 0], shrink = [0, 0], armed = [false, false];
  let balls: Ball[] = [], pause = 1.2, serveTo = Math.random() < 0.5 ? 0 : 1, orb: { x: number; y: number; kind: Kind } | null = null, orbIn = 5, flash = 0, hits = 0, seenHits = 0, seenScore = 0;
  let proj: World['to2d'] = (x, y) => [x, y];
  const half = (s: number) => (giant[s] > 0 ? 52 : shrink[s] > 0 ? 21 : 33);
  const lineY = (s: number) => (s === 0 ? H - PY : PY);
  const serve = () => { const a = (Math.random() - 0.5) * 0.9, dir = serveTo === 0 ? 1 : -1; balls = [{ x: W / 2, y: H / 2, vx: Math.sin(a), vy: Math.cos(a) * dir, sp: 285, curve: 0, hot: false, last: -1 }]; };
  const grant = (kind: Kind, to: number, b: Ball) => {
    if (kind === 'giant') { giant[to] = 8; shrink[to] = 0; } else if (kind === 'fire') armed[to] = true; else if (kind === 'ice') slow[1 - to] = 4.5; else if (kind === 'shrink') { shrink[1 - to] = 7; giant[1 - to] = 0; }
    else if (kind === 'curve') b.curve = (Math.random() < 0.5 ? -1 : 1) * 1.5;
    else for (const d of [-0.5, 0.5]) if (balls.length < 5) { const a = Math.atan2(b.vx, b.vy) + d; balls.push({ ...b, vx: Math.sin(a), vy: Math.cos(a), curve: 0 }); }
  };
  const effects = () => {
    if (hits !== seenHits) { seenHits = hits; sfx.place(); }
    if (score[0] + score[1] !== seenScore) { seenScore = score[0] + score[1]; flash = 1.2; sfx.great(); buzz(50); fx.shake(7, 0.35); }
  };
  return {
    step(dt, inputs, auth) {
      flash = Math.max(0, flash - dt);
      for (const s of [0, 1]) {
        giant[s] = Math.max(0, giant[s] - dt); slow[s] = Math.max(0, slow[s] - dt); shrink[s] = Math.max(0, shrink[s] - dt);
        const target = inputs[s];
        if (!target) continue;
        const h = half(s), tx = clamp(target.x, h, W - h), d = tx - px[s];
        px[s] += clamp(d, -(slow[s] > 0 ? 190 : 1400) * dt, (slow[s] > 0 ? 190 : 1400) * dt);
      }
      if (pause > 0) { pause -= dt; if (pause <= 0 && auth && !balls.length) serve(); effects(); return; }
      for (const b of balls) {
        // A curving ball bends sideways; the direction stays a unit vector.
        if (b.curve) { b.vx += b.curve * dt; const n = Math.hypot(b.vx, b.vy); b.vx /= n; b.vy /= n; if (Math.abs(b.vy) < 0.35) { b.vy = Math.sign(b.vy || 1) * 0.35; b.curve = 0; } }
        const steps = Math.max(1, Math.ceil((b.sp * dt) / 4));
        for (let i = 0; i < steps; i++) {
          b.x += (b.vx * b.sp * dt) / steps; b.y += (b.vy * b.sp * dt) / steps;
          if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
          for (const s of [0, 1]) {
            const y = lineY(s), toward = s === 0 ? b.vy > 0 : b.vy < 0;
            if (!toward || Math.abs(b.y - y) > BR + 5 || Math.abs(b.x - px[s]) > half(s) + BR) continue;
            const a = clamp((b.x - px[s]) / half(s), -1, 1) * 1.05;
            b.vx = Math.sin(a); b.vy = Math.cos(a) * (s === 0 ? -1 : 1); b.y = y + (s === 0 ? -(BR + 5) : BR + 5);
            b.sp = Math.min(660, b.sp * 1.06); b.hot = false; b.curve = 0; b.last = s;
            if (armed[s]) { armed[s] = false; b.sp = Math.min(820, b.sp * 1.5); b.hot = true; }
            hits++;
          }
        }
        if (auth && orb && b.last >= 0 && Math.hypot(b.x - orb.x, b.y - orb.y) < BR + 16) { grant(orb.kind, b.last, b); orb = null; orbIn = 5 + Math.random() * 4; hits++; }
      }
      // A ball past a paddle: a point (decided by the host only).
      const out = balls.filter((b) => b.y < -BR * 2 || b.y > H + BR * 2);
      if (out.length) {
        if (auth) {
          for (const b of out) { const scorer = b.y < 0 ? 0 : 1; score[scorer]++; serveTo = 1 - scorer; }
          balls = balls.filter((b) => !out.includes(b));
          if (!balls.length) pause = 0.9;
        } else for (const b of out) { b.sp = 0; }
      }
      if (auth && !orb) { orbIn -= dt; if (orbIn <= 0) orb = { x: 40 + Math.random() * (W - 80), y: H / 2 - 90 + Math.random() * 180, kind: KINDS[Math.floor(Math.random() * KINDS.length)] }; }
      effects();
    },
    snap: () => ({ b: balls.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx * 1000), Math.round(b.vy * 1000), Math.round(b.sp), Math.round(b.curve * 100), b.hot ? 1 : 0, b.last]), p: px.map(Math.round), sc: score, t: [giant, slow, shrink].map((a) => a.map((v) => Math.round(v * 10))), a: armed.map((v) => (v ? 1 : 0)), f: Math.round(pause * 10), o: orb ? [Math.round(orb.x), Math.round(orb.y), KINDS.indexOf(orb.kind)] : null, h: hits }),
    load(raw, me) {
      const s = raw as { b: number[][]; p: number[]; sc: number[]; t: number[][]; a: number[]; f: number; o: number[] | null; h: number };
      balls = s.b.map((v, i) => {
        const old = balls[i], near = old && Math.hypot(old.x - v[0], old.y - v[1]) < 36;
        return { x: near ? old.x + (v[0] - old.x) * 0.4 : v[0], y: near ? old.y + (v[1] - old.y) * 0.4 : v[1], vx: v[2] / 1000, vy: v[3] / 1000, sp: v[4], curve: v[5] / 100, hot: !!v[6], last: v[7] };
      });
      // The rival's paddle comes from the host; one's own follows the hand at once (see the stage).
      px.forEach((_, i) => { if (i !== me) px[i] += (s.p[i] - px[i]) * 0.5; });
      score[0] = s.sc[0]; score[1] = s.sc[1];
      [giant, slow, shrink].forEach((a, i) => { a[0] = s.t[i][0] / 10; a[1] = s.t[i][1] / 10; });
      armed[0] = !!s.a[0]; armed[1] = !!s.a[1]; pause = s.f / 10;
      orb = s.o ? { x: s.o[0], y: s.o[1], kind: KINDS[s.o[2]] ?? 'giant' } : null;
      hits = s.h;
    },
    bot(seat, dt) {
      // Goes where the nearest ball coming its way will cross its line (walls included), not quite perfectly.
      const y = lineY(seat);
      let target = W / 2, soon = Infinity;
      for (const b of balls) {
        const toward = seat === 0 ? b.vy > 0 : b.vy < 0;
        if (!toward) continue;
        const time = Math.abs((y - b.y) / (b.vy * b.sp || 1));
        if (time >= soon) continue;
        soon = time;
        let x = b.x + b.vx * b.sp * time;
        const span = W - BR * 2;
        x = ((((x - BR) % (span * 2)) + span * 2) % (span * 2)); if (x > span) x = span * 2 - x;
        target = x + BR + Math.sin(b.x * 0.05 + b.sp) * 16;
      }
      return { x: px[seat] + clamp(target - px[seat], -430 * dt, 430 * dt), y };
    },
    render(w, time, _names, colors) {
      const p = w.pal, wall = p.dark ? '#4a3f78' : '#f0e2c8', line = p.dark ? '#5a4f85' : '#d9cfbd';
      proj = w.to2d;
      w.box(W / 2, H / 2, W, H, 4, p.paper, { z: -4 });
      for (const sx of [-6, W + 6]) w.box(sx, H / 2, 12, H + 8, 20, wall);
      for (let i = 0; i < 11; i++) w.box(18 + i * 26.4, H / 2, 14, 4, 0.8, line); // the net's dashes
      for (const s of [0, 1]) {
        const h = half(s), c = slow[s] > 0 ? '#bfe9ff' : colors[s];
        w.box(px[s], lineY(s), h * 2, 12, 14, c);
        w.box(px[s], lineY(s), h * 2 - 8, 6, 3, p.dark ? '#0e0a1c' : '#2b2440', { z: 14 });
        if (armed[s]) w.ball(px[s], lineY(s), 6 + Math.sin(time * 12) * 1.5, p.orange, 20);
      }
      if (orb) w.ball(orb.x, orb.y, 14, p.sun, 10 + Math.sin(time * 5) * 4);
      for (const b of balls) { w.ball(b.x, b.y, BR, b.hot ? p.orange : b.curve ? p.grape : p.dark ? '#f4f0ff' : '#2b2440', 2); if (b.hot) w.ball(b.x - b.vx * 12, b.y - b.vy * 12, BR * 0.7, p.sun, 3); }
    },
    hud(g, w, time, names, colors) {
      const p = w.pal;
      seatPills(g, p, [0, 1].map((s) => ({ name: names[s], value: String(score[s]), color: colors[s], active: false })));
      for (const s of [0, 1]) if (slow[s] > 0) { const [ix, iy] = w.to2d(px[s], lineY(s), 30); write(g, p, '❄', ix, iy, 20, 800); }
      if (orb) { const [ox, oy] = w.to2d(orb.x, orb.y, 30); write(g, p, ICON[orb.kind], ox, oy, 16, 800); }
      const [cx, cy] = w.to2d(W / 2, H / 2, 10);
      if (flash > 0) { g.globalAlpha = Math.min(1, flash); label(g, p, t('goal'), cx, cy, 44, p.sun); g.globalAlpha = 1; }
      else if (pause > 0 && score[0] + score[1] === 0) label(g, p, String(Math.ceil(pause * 2.5)), cx, cy, 42, p.white);
      void time; void proj;
    },
    winner: () => (score[0] >= WIN ? 0 : score[1] >= WIN ? 1 : -1),
  };
}
