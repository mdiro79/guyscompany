import type { Rules } from './types';
import { rng } from '../kit/rng';

// Flick Soccer. Two teams of five discs and a ball on a walled pitch. A turn is one flick of one disc;
// everything then slides and bounces until it stands still. A disc touching the power star arms its
// team's next flick: fire (a much harder flick), big (the flicked disc is larger) or ice (the rival's
// discs are heavy and hardly move for that flick). After a goal everything is set up again and the team
// that conceded flicks first. First to three goals wins.
// The mover's device works out the motion and sends the result with key frames for everyone's animation.

export const FW = 300, FH = 460, GOAL = 110, DR = 15, BR = 9, MAX_FLICK = 640, WIN = 3;
export type Power = 'fire' | 'big' | 'ice';
export interface Pt { x: number; y: number }
export interface SoccerState {
  d: Pt[]; // ten discs: 0–4 seat 0 (defends the bottom goal), 5–9 seat 1
  ball: Pt; score: [number, number]; turn: number; power: (Power | null)[];
  star: (Pt & { kind: Power }) | null; seed: number; n: number;
  play: { seat: number; i: number; used: Power | null; frames: number[][]; goal: number; before: number[] } | null; // the last flick, for the animation
}
export interface SoccerMove { i: number; vx: number; vy: number } // i: 0–4, the disc of the mover's team

const HOME: Pt[] = [{ x: 150, y: 425 }, { x: 82, y: 352 }, { x: 218, y: 352 }, { x: 104, y: 270 }, { x: 196, y: 270 }];
const lineUp = (): Pt[] => [...HOME.map((p) => ({ ...p })), ...HOME.map((p) => ({ x: FW - p.x, y: FH - p.y }))];
const flat = (d: Pt[], ball: Pt) => [...d, ball].flatMap((p) => [Math.round(p.x), Math.round(p.y)]);

interface Body { x: number; y: number; vx: number; vy: number; r: number; m: number }
/** Lets everything move until it rests. Returns the end positions, key frames, who scored (-1: nobody) and whether the star was taken. */
export function flick(s: SoccerState, seat: number, i: number, vx: number, vy: number, used: Power | null) {
  const bodies: Body[] = s.d.map((p, k) => {
    const own = seat === 0 ? k < 5 : k >= 5;
    return { x: p.x, y: p.y, vx: 0, vy: 0, r: DR, m: !own && used === 'ice' ? 9 : 2 };
  });
  const ball: Body = { x: s.ball.x, y: s.ball.y, vx: 0, vy: 0, r: BR, m: 1 };
  bodies.push(ball);
  const k = seat * 5 + i, me = bodies[k];
  if (used === 'big') { me.r = 22; me.m = 3.2; }
  me.vx = vx; me.vy = vy;
  const frames: number[][] = [], dt = 1 / 120;
  let goal = -1, took = false;
  for (let step = 0; step < 1100; step++) {
    let moving = false;
    for (const b of bodies) {
      const f = b === ball ? 0.9915 : 0.987;
      b.vx *= f; b.vy *= f;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.vx * b.vx + b.vy * b.vy > 16) moving = true;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.82; } else if (b.x > FW - b.r) { b.x = FW - b.r; b.vx = -Math.abs(b.vx) * 0.82; }
      const inMouth = b === ball && Math.abs(b.x - FW / 2) < GOAL / 2 - 2;
      if (b.y < b.r && !inMouth) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.82; } else if (b.y > FH - b.r && !inMouth) { b.y = FH - b.r; b.vy = -Math.abs(b.vy) * 0.82; }
    }
    for (let a = 0; a < bodies.length; a++) for (let c = a + 1; c < bodies.length; c++) {
      const p = bodies[a], q = bodies[c], dx = q.x - p.x, dy = q.y - p.y, min = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / (p.m + q.m);
      p.x -= nx * push * q.m; p.y -= ny * push * q.m; q.x += nx * push * p.m; q.y += ny * push * p.m;
      const rel = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (rel > 0) continue;
      const j = (-(1 + 0.9) * rel) / (1 / p.m + 1 / q.m);
      p.vx -= (j / p.m) * nx; p.vy -= (j / p.m) * ny; q.vx += (j / q.m) * nx; q.vy += (j / q.m) * ny;
    }
    if (s.star && !took && (me.x - s.star.x) ** 2 + (me.y - s.star.y) ** 2 < (me.r + 11) ** 2) took = true;
    if (step % 6 === 0 && frames.length < 120) frames.push(flat(bodies.slice(0, 10), ball));
    if (ball.y < -BR) { goal = 0; break; }
    if (ball.y > FH + BR) { goal = 1; break; }
    if (!moving && step > 12) break;
  }
  const end = flat(bodies.slice(0, 10), ball);
  frames.push(end);
  return { d: bodies.slice(0, 10).map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })), ball: { x: Math.round(ball.x), y: Math.round(ball.y) }, frames, goal, took };
}
const KINDS: Power[] = ['fire', 'big', 'ice'];

export const rules: Rules<SoccerState, SoccerMove> = {
  players: [2, 2],
  init: (_n, seed, first) => ({ d: lineUp(), ball: { x: FW / 2, y: FH / 2 }, score: [0, 0], turn: first % 2, power: [null, null], star: null, seed, n: 0, play: null }),
  turn: (s) => (s.score[0] >= WIN || s.score[1] >= WIN ? -1 : s.turn),
  apply(s, seat, m) {
    if (seat !== s.turn || s.score[0] >= WIN || s.score[1] >= WIN || !m || !Number.isInteger(m.i) || m.i < 0 || m.i > 4 || !Number.isFinite(m.vx) || !Number.isFinite(m.vy)) return null;
    const used = s.power[seat], speed = Math.hypot(m.vx, m.vy);
    if (speed < 20) return null;
    const cap = Math.min(1, MAX_FLICK / speed) * (used === 'fire' ? 1.65 : 1);
    const out = flick(s, seat, m.i, m.vx * cap, m.vy * cap, used);
    const r = rng(s.seed * 7 + s.n * 7919 + 2), n = s.n + 1;
    const power = s.power.map((p, i) => (i === seat ? (out.took && s.star ? s.star.kind : null) : p));
    let star = out.took ? null : s.star;
    // A new star appears every third flick, somewhere in the middle of the pitch.
    if (!star && n % 3 === 0) star = { x: Math.round(50 + r() * (FW - 100)), y: Math.round(150 + r() * (FH - 300)), kind: KINDS[Math.floor(r() * 3)] };
    const play = { seat, i: m.i, used, frames: out.frames, goal: out.goal, before: flat(s.d, s.ball) };
    if (out.goal >= 0) {
      const score: [number, number] = [s.score[0] + (out.goal === 0 ? 1 : 0), s.score[1] + (out.goal === 1 ? 1 : 0)];
      return { ...s, d: lineUp(), ball: { x: FW / 2, y: FH / 2 }, score, turn: 1 - out.goal, power, star, n, play };
    }
    return { ...s, d: out.d, ball: out.ball, turn: 1 - seat, power, star, n, play };
  },
  result: (s) => (s.score[0] >= WIN ? { winners: [0], scores: [...s.score] } : s.score[1] >= WIN ? { winners: [1], scores: [...s.score] } : null),
  bot(s, seat, rnd) {
    // Strike the ball towards the rival's goal with the disc that has the clearest line to the spot behind it.
    const goal = { x: FW / 2, y: seat === 0 ? -12 : FH + 12 };
    let gx = goal.x - s.ball.x, gy = goal.y - s.ball.y;
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;
    const spot = { x: s.ball.x - gx * (BR + DR - 3), y: s.ball.y - gy * (BR + DR - 3) };
    let best = { i: 0, vx: 0, vy: seat === 0 ? -300 : 300, v: -Infinity };
    for (let i = 0; i < 5; i++) {
      const me = s.d[seat * 5 + i], dx = spot.x - me.x, dy = spot.y - me.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      const forward = ux * gx + uy * gy;
      let blocked = 0;
      s.d.forEach((o, k) => {
        if (k === seat * 5 + i) return;
        const t = Math.max(0, Math.min(dist, (o.x - me.x) * ux + (o.y - me.y) * uy));
        if (Math.hypot(me.x + ux * t - o.x, me.y + uy * t - o.y) < DR * 2 - 2) blocked++;
      });
      const v = forward * 2.2 - dist / 260 - blocked * 3 + rnd() * 0.3;
      if (v > best.v) { const sp = Math.max(330, Math.min(MAX_FLICK, 300 + dist * 1.5)), a = (rnd() - 0.5) * 0.14, c = Math.cos(a), sn = Math.sin(a); best = { i, vx: (ux * c - uy * sn) * sp, vy: (ux * sn + uy * c) * sp, v }; }
    }
    return { i: best.i, vx: best.vx, vy: best.vy };
  },
};
