import type { World } from '../kit/World';
import { label, write, type G } from '../kit/fx';
import { buzz, sfx } from '../kit/sfx';
import { wanted, noInput, type ArenaCtx, type ArenaInput, type ArenaSim } from '../kit/arena';

// Coin Rush. A minute of chaos in a walled yard: coins keep raining down, grab as many as you can. Dash
// into a rival to knock coins out of their pocket (they scatter, anyone can pick them up). Now and then a
// bomb falls: its shadow grows where it will land, and whoever is caught loses a third of their coins and
// is dizzy for a moment. A golden star coin is worth five. Most coins when the time runs out wins.

export const ROUND_S = 60;
const R = 19, SPEED = 215, ACCEL = 5, DASH = 430, DASH_COOL = 1.1, DASH_HIT = 0.32;
const COIN_R = 9, MAX_COINS = 34, BOMB_WARN = 1.3, BOMB_R = 78, DIZZY = 0.9;
export const rushSize = (n: number): [number, number] => [560 + Math.max(0, n - 2) * 70, 440 + Math.max(0, n - 2) * 50];

interface Runner { x: number; y: number; vx: number; vy: number; coins: number; cool: number; dashT: number; dizzy: number; dashSeen: number; aimX: number; aimY: number }
interface Coin { x: number; y: number; vx: number; vy: number; z: number; vz: number; v: number } // v: worth (1 or 5)
interface Bomb { x: number; y: number; t: number }
interface Snap { ph: number; tm: number; left: number; pl: number[][]; co: number[][]; bo: number[][]; over: number }

export function makeRush(c: ArenaCtx, rnd: () => number = Math.random): ArenaSim {
  const n = c.n, [W, H] = rushSize(n);
  const pl: Runner[] = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: W / 2 + Math.cos(a) * W * 0.32, y: H / 2 + Math.sin(a) * H * 0.32, vx: 0, vy: 0, coins: 0, cool: 0.5, dashT: 0, dizzy: 0, dashSeen: 0, aimX: 0, aimY: 1 };
  });
  let coins: Coin[] = [], bombs: Bomb[] = [], phase: 'count' | 'play' | 'over' = 'count', timer = 2.6, left = ROUND_S, coinIn = 0, bombIn = 6, over = false;
  const botAim = new Array<number>(n).fill(0);

  const drop = (x: number, y: number, v = 1, fling = 0) => {
    if (coins.length >= MAX_COINS + 20) return;
    const a = rnd() * Math.PI * 2, s = fling * (0.5 + rnd() * 0.6);
    coins.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: fling ? 6 : 160 + rnd() * 80, vz: fling ? 170 + rnd() * 90 : 0, v });
  };
  const spill = (p: Runner, count: number) => {
    let left2 = Math.min(p.coins, count);
    p.coins -= left2;
    while (left2 > 0) { drop(p.x, p.y, 1, 230); left2--; }
  };

  const physics = (dt: number, inputs: ArenaInput[] | null) => {
    pl.forEach((p, i) => {
      p.cool = Math.max(0, p.cool - dt); p.dashT = Math.max(0, p.dashT - dt); p.dizzy = Math.max(0, p.dizzy - dt);
      if (inputs && p.dizzy <= 0) {
        const inp = inputs[i];
        const [wx, wy] = wanted(inp, p.x, p.y, SPEED);
        const k = Math.min(1, ACCEL * dt);
        p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
        if (inp.tx !== null && inp.ty !== null && Math.hypot(inp.tx - p.x, inp.ty - p.y) > 6) { const d = Math.hypot(inp.tx - p.x, inp.ty - p.y); p.aimX = (inp.tx - p.x) / d; p.aimY = (inp.ty - p.y) / d; }
        else if (Math.hypot(p.vx, p.vy) > 20) { const d = Math.hypot(p.vx, p.vy); p.aimX = p.vx / d; p.aimY = p.vy / d; }
        if (inp.dash > p.dashSeen) {
          p.dashSeen = inp.dash;
          if (p.cool <= 0) { p.vx = p.aimX * DASH; p.vy = p.aimY * DASH; p.cool = DASH_COOL; p.dashT = DASH_HIT; sfx.move(); if (i === c.seat) buzz(20); }
        }
      } else { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
      p.x += p.vx * dt; p.y += p.vy * dt;
      // The yard's walls.
      if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx) * 0.5; } else if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < R) { p.y = R; p.vy = Math.abs(p.vy) * 0.5; } else if (p.y > H - R) { p.y = H - R; p.vy = -Math.abs(p.vy) * 0.5; }
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pl[i], b = pl[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (R * 2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) { a.vx -= rel * nx * 0.9; a.vy -= rel * ny * 0.9; b.vx += rel * nx * 0.9; b.vy += rel * ny * 0.9; }
      if (!inputs) continue;
      // A dash into someone knocks coins out of their pocket.
      for (const [hit, by] of [[b, a], [a, b]] as const) {
        if (by.dashT <= 0 || hit.dizzy > 0) continue;
        by.dashT = 0;
        hit.dizzy = DIZZY * 0.6;
        spill(hit, Math.max(2, Math.ceil(hit.coins * 0.2)));
        const [x, y] = c.to2d(hit.x, hit.y, R);
        c.fx.pop(x, y, '#ffd34d', 28); sfx.hit();
        if (hit === pl[c.seat] || by === pl[c.seat]) buzz(30);
      }
    }
    // Coins: fall, bounce and settle.
    for (const k of coins) {
      if (k.z > 0 || k.vz > 0) {
        k.vz -= 900 * dt; k.z += k.vz * dt; k.x += k.vx * dt; k.y += k.vy * dt;
        if (k.z <= 0) { k.z = 0; k.vz = k.vz < -140 ? -k.vz * 0.35 : 0; k.vx *= 0.5; k.vy *= 0.5; }
        k.x = Math.max(COIN_R, Math.min(W - COIN_R, k.x)); k.y = Math.max(COIN_R, Math.min(H - COIN_R, k.y));
      }
    }
  };

  const step = (dt: number, inputs: ArenaInput[]) => {
    if (phase === 'count') { timer -= dt; if (timer <= 0) { phase = 'play'; sfx.start(); } physics(dt, null); return; }
    if (phase === 'over') { timer -= dt; physics(dt, null); if (timer <= 0) over = true; return; }
    left = Math.max(0, left - dt);
    physics(dt, inputs);
    // Rain of coins (faster near the end), now and then a golden star.
    coinIn -= dt;
    if (coinIn <= 0 && coins.length < MAX_COINS) { coinIn = left < 15 ? 0.22 : 0.38; drop(30 + rnd() * (W - 60), 30 + rnd() * (H - 60), rnd() < 0.07 ? 5 : 1); }
    // Pick-ups.
    coins = coins.filter((k) => {
      if (k.z > 14) return true;
      const who = pl.findIndex((p) => p.dizzy <= 0 && Math.hypot(k.x - p.x, k.y - p.y) < R + COIN_R);
      if (who < 0) return true;
      pl[who].coins += k.v;
      const [x, y] = c.to2d(k.x, k.y, 10);
      c.fx.text(x, y - 10, `+${k.v}`, k.v > 1 ? '#ffd34d' : '#ffffff', k.v > 1 ? 20 : 14);
      if (who === c.seat) sfx.point(Math.min(14, pl[who].coins % 15));
      return false;
    });
    // Bombs.
    bombIn -= dt;
    if (bombIn <= 0) {
      bombIn = Math.max(2.2, 5.5 - (ROUND_S - left) * 0.05);
      // Most of them fall near whoever leads.
      const lead = pl.reduce((b, p, i) => (p.coins > pl[b].coins ? i : b), 0);
      const near = rnd() < 0.6 && pl[lead].coins > 0;
      bombs.push({ x: near ? pl[lead].x + (rnd() - 0.5) * 120 : 40 + rnd() * (W - 80), y: near ? pl[lead].y + (rnd() - 0.5) * 120 : 40 + rnd() * (H - 80), t: BOMB_WARN });
    }
    bombs = bombs.filter((b) => {
      b.t -= dt;
      if (b.t > 0) return true;
      const [x, y] = c.to2d(b.x, b.y, 0);
      c.fx.burst(x, y, '#ff8a3d', 26, 300, 4.5); c.fx.shake(7, 0.3); sfx.boom();
      pl.forEach((p, i) => {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d > BOMB_R + R) return;
        p.dizzy = DIZZY;
        spill(p, Math.ceil(p.coins / 3));
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        p.vx = Math.cos(a) * 320; p.vy = Math.sin(a) * 320;
        if (i === c.seat) buzz(90);
      });
      return false;
    });
    if (left <= 0) { phase = 'over'; timer = 2.2; bombs = []; sfx.win(); }
  };

  const bot = (i: number, dt: number): ArenaInput => {
    const p = pl[i], inp = noInput();
    botAim[i] = Math.max(0, botAim[i] - dt);
    // Away from a bomb about to land.
    const danger = bombs.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < BOMB_R + R + 20);
    if (danger) { const a = Math.atan2(p.y - danger.y, p.x - danger.x); inp.tx = p.x + Math.cos(a) * 120; inp.ty = p.y + Math.sin(a) * 120; return inp; }
    // A rich rival close by: ram them.
    const rich = pl.findIndex((o, j) => j !== i && o.coins >= 4 && o.dizzy <= 0 && Math.hypot(o.x - p.x, o.y - p.y) < 110);
    if (rich >= 0 && p.cool <= 0 && botAim[i] <= 0) {
      inp.tx = pl[rich].x; inp.ty = pl[rich].y; inp.dash = p.dashSeen + 1; botAim[i] = 1 + rnd(); return inp;
    }
    inp.dash = p.dashSeen;
    // Else the best coin: worth over distance.
    let best: Coin | null = null, bestV = -1;
    for (const k of coins) { if (k.z > 60) continue; const v = k.v / (Math.hypot(k.x - p.x, k.y - p.y) + 40); if (v > bestV) { bestV = v; best = k; } }
    if (best) { inp.tx = best.x; inp.ty = best.y; } else { inp.tx = W / 2; inp.ty = H / 2; }
    return inp;
  };

  const snap = (): Snap => ({
    ph: phase === 'count' ? 0 : phase === 'play' ? 1 : 2, tm: Math.round(timer * 10), left: Math.round(left * 10), over: over ? 1 : 0,
    pl: pl.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.coins, Math.round(p.dizzy * 10), Math.round(p.cool * 10), p.dashT > 0 ? 1 : 0]),
    co: coins.map((k) => [Math.round(k.x), Math.round(k.y), Math.round(k.z), k.v, Math.round(k.vx), Math.round(k.vy), Math.round(k.vz)]),
    bo: bombs.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.t * 100)]),
  });
  let seenBombs = 0;
  const load = (raw: unknown) => {
    const s = raw as Snap;
    if (s.ph === 1 && phase === 'count') sfx.start();
    phase = s.ph === 0 ? 'count' : s.ph === 1 ? 'play' : 'over'; timer = s.tm / 10; left = s.left / 10;
    s.pl.forEach((v, i) => {
      const p = pl[i];
      if (!p) return;
      if (v[4] > p.coins && i === c.seat) sfx.point(Math.min(14, v[4] % 15));
      Object.assign(p, { x: v[0], y: v[1], vx: v[2], vy: v[3], coins: v[4], dizzy: v[5] / 10, cool: v[6] / 10, dashT: v[7] ? 0.1 : 0 });
    });
    coins = s.co.map((k) => ({ x: k[0], y: k[1], z: k[2], v: k[3], vx: k[4], vy: k[5], vz: k[6] }));
    // A bomb that vanished from the list went off.
    if (s.bo.length < seenBombs) for (const b of bombs) if (b.t < 0.15) { const [x, y] = c.to2d(b.x, b.y, 0); c.fx.burst(x, y, '#ff8a3d', 26, 300, 4.5); c.fx.shake(6, 0.25); sfx.boom(); }
    seenBombs = s.bo.length;
    bombs = s.bo.map((b) => ({ x: b[0], y: b[1], t: b[2] / 100 }));
  };

  return {
    step, bot, snap, load,
    predict(dt) {
      if (phase === 'count') return;
      for (const p of pl) { p.x += p.vx * dt; p.y += p.vy * dt; }
      for (const b of bombs) b.t -= dt;
      for (const k of coins) if (k.z > 0 || k.vz > 0) { k.vz -= 900 * dt; k.z = Math.max(0, k.z + k.vz * dt); k.x += k.vx * dt; k.y += k.vy * dt; }
      if (phase === 'play') left = Math.max(0, left - dt);
    },
    winners: () => {
      if (!over) return [];
      const top = Math.max(...pl.map((p) => p.coins));
      return pl.flatMap((p, i) => (p.coins === top ? [i] : []));
    },
    render(w, t) {
      const p = w.pal, colors = c.colors();
      w.box(W / 2, H / 2, W, H, 4, p.paper, { z: -4 });
      const fence = p.dark ? '#4a3f78' : '#e8d5b0';
      for (const x of [-7, W + 7]) w.box(x, H / 2, 14, H + 28, 22, fence);
      for (const y of [-7, H + 7]) w.box(W / 2, y, W + 28, 14, 22, fence);
      for (const b of bombs) {
        const k = 1 - Math.max(0, b.t) / BOMB_WARN;
        w.disc(b.x, b.y, BOMB_R * (0.3 + 0.7 * k), 1, k > 0.75 && Math.sin(t * 40) > 0 ? p.coral : p.dark ? '#5a2433' : '#f2b9a8', 0.2);
        w.ball(b.x, b.y, 16, '#2b2440', 30 + Math.max(0, b.t) * 260);
      }
      for (const k of coins) {
        const gold = k.v > 1;
        if (k.z > 2) w.disc(k.x, k.y, COIN_R * 0.8, 0.5, p.dark ? '#1a1430' : '#d6c6a6', 0.1);
        w.disc(k.x, k.y, gold ? COIN_R * 1.35 : COIN_R, 4, gold ? '#ffd34d' : '#f5b301', k.z + Math.abs(Math.sin(t * 4 + k.x)) * (k.z ? 0 : 3));
        if (gold) w.cone(k.x, k.y, 6, 10, '#fff4b0', { z: k.z + 6 });
      }
      pl.forEach((r, i) => {
        const dizzy = r.dizzy > 0;
        w.disc(r.x, r.y, R * 0.95, 2, p.dark ? '#140f26' : '#c9b893', 0.1);
        w.box(r.x, r.y, R * 1.5, R * 1.5, R * 1.3, colors[i], { rot: dizzy ? t * 12 : Math.atan2(r.aimY, r.aimX), z: 1 });
        // A sack of coins on the back grows with the haul.
        const sack = Math.min(14, 5 + Math.sqrt(r.coins) * 1.6);
        w.ball(r.x - r.aimX * R * 0.7, r.y - r.aimY * R * 0.7, sack, '#c89b4b', R * 1.1);
        for (const side of [-1, 1]) w.ball(r.x + r.aimX * R * 0.65 - r.aimY * side * 6, r.y + r.aimY * R * 0.65 + r.aimX * side * 6, 4, '#ffffff', R * 0.9);
        if (r.dashT > 0) w.disc(r.x, r.y, R * 1.35, 2, p.sun, 2);
        if (dizzy) for (let k = 0; k < 3; k++) { const a = t * 6 + (k * Math.PI * 2) / 3; w.ball(r.x + Math.cos(a) * 14, r.y + Math.sin(a) * 14, 3.5, p.sun, R * 1.9); }
      });
    },
    hud(g: G, w: World) {
      const p = w.pal, names = c.names(), colors = c.colors();
      pl.forEach((r, i) => {
        const [x, y] = w.to2d(r.x, r.y, R * 2.6);
        write(g, p, `${i === c.seat ? '▼ ' : ''}${names[i]} · ${r.coins}`, x, y, 11, 800, colors[i], 140);
      });
      // The time and the ranking along the top.
      const [tx, ty] = w.to2d(W / 2, -26, 0);
      label(g, p, `⏱ ${Math.ceil(left)}`, tx, Math.max(16, ty - 18), 18, left <= 10 ? p.coral : p.white);
      const order = pl.map((r, i) => i).sort((a, b) => pl[b].coins - pl[a].coins), stepX = Math.min(120, 460 / n);
      order.forEach((i, k) => write(g, p, `${k + 1}. ${names[i].slice(0, 8)} ${pl[i].coins}`, tx + (k - (n - 1) / 2) * stepX, Math.max(36, ty + 4), 11, 800, colors[i], stepX - 6));
      const [cx, cy] = w.to2d(W / 2, H / 2, 10);
      if (phase === 'count') { label(g, p, c.t('ready'), cx, cy - 34, 22, p.white); label(g, p, String(Math.max(1, Math.ceil(timer))), cx, cy + 12, 48, p.sun); }
      else if (phase === 'over') label(g, p, c.t('timeUp'), cx, cy, 26, p.sun, 520);
    },
  };
}
