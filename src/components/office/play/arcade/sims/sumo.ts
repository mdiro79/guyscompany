import type { World } from '../kit/World';
import { label, write, type G } from '../kit/fx';
import { buzz, sfx } from '../kit/sfx';
import { wanted, noInput, type ArenaCtx, type ArenaInput, type ArenaSim } from '../kit/arena';

// Sumo Bumpers. Every player is a bouncy bumper ball on a round platform floating in the sky. Push the
// others over the edge: steer into them, or dash (a short burst) to ram them. The platform shrinks as the
// round goes on, and after that keeps shrinking slowly until someone falls. Power stones appear now and then: 🪨 heavy (hard to push, hits hard) and 🌀 spring
// (whoever you touch flies off). The last one on the platform wins the round; three rounds win the match.

export const S = 640; // field size
export const WIN = 3;
const C = S / 2, R0 = 280, R_MIN = 120, SHRINK_AFTER = 6, SHRINK_TIME = 28, R_END = 8, SUDDEN = 5; // SUDDEN: units a second after the main shrink
const BALL = 23, SPEED = 230, ACCEL = 4.2, DASH = 470, DASH_COOL = 1.3, POWER_TIME = 7;
type Kind = 'heavy' | 'spring';
const KINDS: Kind[] = ['heavy', 'spring'];
const ICON: Record<Kind, string> = { heavy: '🪨', spring: '🌀' };

interface Bumper { x: number; y: number; vx: number; vy: number; z: number; alive: boolean; falling: number; cool: number; heavy: number; spring: number; dashSeen: number; aimX: number; aimY: number; hitBy: number }
interface Snap { r: number; ph: number; tm: number; R: number; pts: number[]; win: number; pl: number[][]; pk: number[][] }

export function makeSumo(c: ArenaCtx, rnd: () => number = Math.random): ArenaSim {
  const n = c.n;
  const pl: Bumper[] = Array.from({ length: n }, () => ({ x: C, y: C, vx: 0, vy: 0, z: 0, alive: true, falling: 0, cool: 0, heavy: 0, spring: 0, dashSeen: 0, aimX: 0, aimY: -1, hitBy: -1 }));
  const pts = new Array<number>(n).fill(0);
  let picks: { x: number; y: number; kind: Kind }[] = [], pickIn = 5, round = 0, phase: 'count' | 'play' | 'over' = 'count', timer = 2.4, time = 0, R = R0, lastWin = -1, over = false;
  const botWant = new Array<number>(n).fill(0); // a little hesitation per computer player

  const newRound = () => {
    round++; picks = []; pickIn = 5; phase = 'count'; timer = 2.4; time = 0; R = R0;
    pl.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2 + round * 0.7 - Math.PI / 2;
      Object.assign(p, { x: C + Math.cos(a) * R0 * 0.62, y: C + Math.sin(a) * R0 * 0.62, vx: 0, vy: 0, z: 0, alive: true, falling: 0, cool: 0.6, heavy: 0, spring: 0, aimX: -Math.cos(a), aimY: -Math.sin(a), hitBy: -1 });
    });
  };
  newRound();
  const mass = (p: Bumper) => (p.heavy > 0 ? 2.8 : 1);
  const knockOut = (p: Bumper, i: number) => {
    p.falling = 0.01;
    const [x, y] = c.to2d(p.x, p.y, 0);
    c.fx.burst(x, y, c.colors()[i], 18, 220); c.fx.shake(i === c.seat ? 10 : 4, 0.3);
    sfx.bad(); if (i === c.seat) buzz(80);
  };

  const physics = (dt: number, inputs: ArenaInput[] | null) => {
    pl.forEach((p, i) => {
      if (!p.alive) return;
      if (p.falling > 0) { p.falling += dt; p.vx *= 0.99; p.vy *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.z -= 520 * p.falling * dt; if (p.falling > 0.9) p.alive = false; return; }
      p.cool = Math.max(0, p.cool - dt); p.heavy = Math.max(0, p.heavy - dt); p.spring = Math.max(0, p.spring - dt);
      if (inputs) {
        const inp = inputs[i];
        const [wx, wy] = wanted(inp, p.x, p.y, SPEED * (p.heavy > 0 ? 0.85 : 1));
        const k = Math.min(1, ACCEL * dt);
        p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
        // Where a dash goes: towards the pointer, else the way it moves.
        if (inp.tx !== null && inp.ty !== null && Math.hypot(inp.tx - p.x, inp.ty - p.y) > 6) { const d = Math.hypot(inp.tx - p.x, inp.ty - p.y); p.aimX = (inp.tx - p.x) / d; p.aimY = (inp.ty - p.y) / d; }
        else if (Math.hypot(p.vx, p.vy) > 20) { const d = Math.hypot(p.vx, p.vy); p.aimX = p.vx / d; p.aimY = p.vy / d; }
        if (inp.dash > p.dashSeen) {
          p.dashSeen = inp.dash;
          if (p.cool <= 0) { p.vx += p.aimX * DASH; p.vy += p.aimY * DASH; p.cool = DASH_COOL; sfx.move(); if (i === c.seat) buzz(20); }
        }
      } else { p.vx *= Math.exp(-0.6 * dt); p.vy *= Math.exp(-0.6 * dt); }
      p.x += p.vx * dt; p.y += p.vy * dt;
    });
    // Bumps: round balls bounce off each other, the lighter one more.
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pl[i], b = pl[j];
      if (!a.alive || !b.alive || a.falling || b.falling) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= BALL * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, ma = mass(a), mb = mass(b);
      const push = (BALL * 2 - d) / 2;
      a.x -= nx * push * (mb / (ma + mb)) * 2; a.y -= ny * push * (mb / (ma + mb)) * 2;
      b.x += nx * push * (ma / (ma + mb)) * 2; b.y += ny * push * (ma / (ma + mb)) * 2;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue;
      const bounce = 1.25 + (a.spring > 0 || b.spring > 0 ? 1.3 : 0);
      const jimp = (bounce * rel) / (1 / ma + 1 / mb);
      a.vx -= (jimp / ma) * nx; a.vy -= (jimp / ma) * ny; b.vx += (jimp / mb) * nx; b.vy += (jimp / mb) * ny;
      if (inputs) { a.hitBy = j; b.hitBy = i; }
      if (rel > 120) {
        const [x, y] = c.to2d((a.x + b.x) / 2, (a.y + b.y) / 2, BALL);
        c.fx.pop(x, y, '#ffffff', 26); sfx.hit();
        if (i === c.seat || j === c.seat) buzz(25);
      }
    }
  };

  const step = (dt: number, inputs: ArenaInput[]) => {
    time += dt;
    if (phase === 'count') { timer -= dt; if (timer <= 0) { phase = 'play'; sfx.start(); } physics(dt, null); return; }
    if (phase === 'over') {
      timer -= dt; physics(dt, null);
      if (timer <= 0) { const top = pts.findIndex((v) => v >= WIN); if (top >= 0) over = true; else newRound(); }
      return;
    }
    if (time > SHRINK_AFTER + SHRINK_TIME) R = Math.max(R_END, R_MIN - (time - SHRINK_AFTER - SHRINK_TIME) * SUDDEN);
    else if (time > SHRINK_AFTER) R = R0 - ((time - SHRINK_AFTER) / SHRINK_TIME) * (R0 - R_MIN);
    physics(dt, inputs);
    pl.forEach((p, i) => { if (p.alive && !p.falling && Math.hypot(p.x - C, p.y - C) > R + BALL * 0.35) knockOut(p, i); });
    for (const k of picks) {
      const who = pl.findIndex((p) => p.alive && !p.falling && Math.hypot(k.x - p.x, k.y - p.y) < BALL + 14);
      if (who < 0) continue;
      picks = picks.filter((o) => o !== k);
      if (k.kind === 'heavy') pl[who].heavy = POWER_TIME; else pl[who].spring = POWER_TIME;
      sfx.good();
      break;
    }
    pickIn -= dt;
    if (pickIn <= 0 && picks.length < 2) {
      pickIn = 6;
      const a = rnd() * Math.PI * 2, d = rnd() * R * 0.6;
      picks.push({ x: C + Math.cos(a) * d, y: C + Math.sin(a) * d, kind: KINDS[Math.floor(rnd() * KINDS.length)] });
    }
    picks = picks.filter((k) => Math.hypot(k.x - C, k.y - C) < R - 10);
    const standing = pl.flatMap((p, i) => (p.alive && !p.falling ? [i] : []));
    const still = pl.some((p) => p.alive && p.falling > 0);
    if (standing.length <= 1 && !still) {
      lastWin = standing[0] ?? -1;
      if (lastWin >= 0) { pts[lastWin]++; sfx.win(); }
      phase = 'over'; timer = 2.6;
    }
  };

  const bot = (i: number, dt: number): ArenaInput => {
    const p = pl[i], inp = noInput();
    if (!p.alive || p.falling) return inp;
    botWant[i] = Math.max(0, botWant[i] - dt);
    const fromC = Math.hypot(p.x - C, p.y - C);
    // Near the edge: back to the middle first.
    if (fromC > R * 0.72) { inp.tx = C; inp.ty = C; return inp; }
    let best = -1, bestD = Infinity;
    pl.forEach((o, j) => { if (j !== i && o.alive && !o.falling) { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bestD) { bestD = d; best = j; } } });
    const near = picks.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < 160);
    if (near && bestD > 110) { inp.tx = near.x; inp.ty = near.y; return inp; }
    if (best < 0) { inp.tx = C; inp.ty = C; return inp; }
    const o = pl[best];
    // Aim a little behind the target, so the push carries it away from the middle.
    // Each computer also circles a little (its own way), so two of them never just lean on each other.
    const ox = o.x - C, oy = o.y - C, od = Math.hypot(ox, oy) || 1, side = i % 2 ? 1 : -1;
    inp.tx = o.x - (ox / od) * 18 - (oy / od) * 30 * side; inp.ty = o.y - (oy / od) * 18 + (ox / od) * 30 * side;
    if (bestD < 160 && p.cool <= 0 && botWant[i] <= 0) { inp.dash = p.dashSeen + 1; botWant[i] = DASH_COOL + rnd() * 1.6; }
    else inp.dash = p.dashSeen;
    return inp;
  };

  const snap = (): Snap => ({
    r: round, ph: phase === 'count' ? 0 : phase === 'play' ? 1 : 2, tm: Math.round(timer * 10), R: Math.round(R), pts: [...pts], win: lastWin,
    pk: picks.map((k) => [Math.round(k.x), Math.round(k.y), KINDS.indexOf(k.kind)]),
    pl: pl.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), (p.alive ? 1 : 0) | (p.falling ? 2 : 0) | (p.heavy > 0 ? 4 : 0) | (p.spring > 0 ? 8 : 0), Math.round(p.z), Math.round(p.cool * 10)]),
  });
  let seenRound = -1;
  const load = (raw: unknown) => {
    const s = raw as Snap;
    if (s.r !== seenRound) { if (seenRound >= 0) sfx.start(); seenRound = s.r; }
    round = s.r; phase = s.ph === 0 ? 'count' : s.ph === 1 ? 'play' : 'over'; timer = s.tm / 10; R = s.R; lastWin = s.win;
    s.pts.forEach((v, i) => { if (i < n) pts[i] = v; });
    picks = s.pk.map((k) => ({ x: k[0], y: k[1], kind: KINDS[k[2]] ?? 'heavy' }));
    s.pl.forEach((v, i) => {
      const p = pl[i];
      if (!p) return;
      const wasUp = p.alive && !p.falling;
      Object.assign(p, { x: v[0], y: v[1], vx: v[2], vy: v[3], alive: !!(v[4] & 1), falling: v[4] & 2 ? Math.max(p.falling, 0.01) : 0, heavy: v[4] & 4 ? 1 : 0, spring: v[4] & 8 ? 1 : 0, z: v[5], cool: v[6] / 10 });
      if (wasUp && p.falling) knockOut(p, i);
    });
  };

  return {
    step, bot, snap, load,
    predict(dt) { if (phase !== 'count') for (const p of pl) if (p.alive) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.falling) p.z -= 520 * p.falling * dt; } },
    winners: () => (over ? [pts.findIndex((v) => v >= WIN)] : []),
    render(w, t) {
      const p = w.pal, colors = c.colors();
      // The floating platform: a thick disc with a lit rim, and stripes that warn where the edge is.
      w.disc(C, C, R + 6, 26, p.dark ? '#3b335f' : '#d9cbb4', -27.5);
      w.disc(C, C, R, 3, p.paper, -3);
      w.disc(C, C, R * 0.35, 1, p.paper2, 0);
      const segs = 40;
      for (let k = 0; k < segs; k++) {
        const a = (k / segs) * Math.PI * 2, x = C + Math.cos(a) * (R - 5), y = C + Math.sin(a) * (R - 5);
        w.box(x, y, 9, (2 * Math.PI * R) / segs - 3, 4, k % 2 ? p.coral : p.white, { rot: a });
      }
      for (const k of picks) w.ball(k.x, k.y, 11, k.kind === 'heavy' ? '#8a8a96' : p.sky, 8 + Math.sin(t * 5 + k.x) * 3);
      pl.forEach((b, i) => {
        if (!b.alive) return;
        const color = colors[i], r = BALL * (b.heavy > 0 ? 1.12 : 1);
        w.disc(b.x, b.y, r * 0.9, 2, p.dark ? '#140f26' : '#b9ab95', b.z - 1);
        w.ball(b.x, b.y, r, b.heavy > 0 ? '#6f6f7c' : color, b.z);
        if (b.heavy > 0) w.disc(b.x, b.y, r * 0.8, 4, color, b.z + r * 1.75);
        if (b.spring > 0) w.disc(b.x, b.y, r * 1.25, 3, p.sky, b.z + r * 0.4 + Math.sin(t * 14) * 3);
        // Eyes look where it is heading.
        const sp = Math.hypot(b.vx, b.vy), ax = sp > 15 ? b.vx / sp : b.aimX, ay = sp > 15 ? b.vy / sp : b.aimY;
        for (const side of [-1, 1]) w.ball(b.x + ax * r * 0.72 - ay * side * r * 0.36, b.y + ay * r * 0.72 + ax * side * r * 0.36, r * 0.2, '#ffffff', b.z + r * 1.2);
        // Dash ready: a small ring under the ball.
        if (b.cool <= 0 && !b.falling) w.disc(b.x, b.y, r * 1.1, 1, color, 0.5);
      });
    },
    hud(g: G, w: World) {
      const p = w.pal, names = c.names(), colors = c.colors();
      for (const k of picks) { const [x, y] = w.to2d(k.x, k.y, 36); write(g, p, ICON[k.kind], x, y, 15, 800); }
      pl.forEach((b, i) => {
        if (!b.alive || b.falling) return;
        const [x, y] = w.to2d(b.x, b.y, BALL * 2.6);
        write(g, p, i === c.seat ? `▼ ${names[i]}` : names[i], x, y, 11, 800, colors[i], 120);
      });
      const [tx, ty] = w.to2d(C, C - R0 - 30, 0), stepX = Math.min(110, 420 / n);
      pts.forEach((v, i) => write(g, p, `${names[i].slice(0, 8)} ${'●'.repeat(v)}${'○'.repeat(Math.max(0, WIN - v))}`, tx + (i - (n - 1) / 2) * stepX, Math.max(14, ty), 11, 800, colors[i], stepX - 6));
      const [cx, cy] = w.to2d(C, C, 10);
      if (phase === 'count') { label(g, p, c.t('round', { n: round }), cx, cy - 34, 22, p.white); label(g, p, String(Math.max(1, Math.ceil(timer))), cx, cy + 12, 48, p.sun); }
      else if (phase === 'over') label(g, p, lastWin >= 0 ? c.t('wonRound', { name: names[lastWin] }) : c.t('noWinner'), cx, cy, 24, lastWin >= 0 ? colors[lastWin] : p.white, 520);
      else if (time > SHRINK_AFTER - 1.5 && time < SHRINK_AFTER + 1.5) label(g, p, c.t('shrinking'), cx, cy - 40, 18, p.coral, 420);
    },
  };
}
