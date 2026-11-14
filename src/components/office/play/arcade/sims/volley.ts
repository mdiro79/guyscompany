import type { World } from '../kit/World';
import { label, write, type G } from '../kit/fx';
import { buzz, sfx } from '../kit/sfx';
import { wanted, noInput, type ArenaCtx, type ArenaInput, type ArenaSim } from '../kit/arena';

// Sky Volley. Volleyball seen from above, two teams across a net (one against one, or two against one or
// two). The ball flies in real arcs; its shadow on the floor shows where it will come down. Run under it
// and you bump it over the net automatically: where it touches you decides where it goes (hit it with
// your left side and it flies right). A dash close to the net is a smash: fast and low. A ball landing on
// your side, or a hit that lands out, is a point for the other team. First team to 7 wins.

export const CW = 440, CH = 680, NET_Y = CH / 2, WIN = 7;
const NET_H = 62, R = 21, SPEED = 250, ACCEL = 7, DASH = 380, DASH_COOL = 0.9, SMASH_T = 0.32;
const BALL = 12, GRAV = 820, REACH = 58, HIT_GAP = 0.35, OUT = 26;
export const teamOf = (seat: number) => seat % 2; // 0: near (bottom) side, 1: far (top) side

interface Player { x: number; y: number; vx: number; vy: number; cool: number; smash: number; dashSeen: number; lastHit: number }
interface Ball { x: number; y: number; z: number; vx: number; vy: number; vz: number; by: number; live: boolean }
interface Snap { ph: number; tm: number; sc: number[]; srv: number; b: number[]; pl: number[][]; last: number }

export function makeVolley(c: ArenaCtx, rnd: () => number = Math.random): ArenaSim {
  const n = c.n;
  const home = (i: number): [number, number] => {
    const team = teamOf(i), mates = Array.from({ length: n }, (_, k) => k).filter((k) => teamOf(k) === team), idx = mates.indexOf(i);
    const x = CW * ((idx + 1) / (mates.length + 1)), y = team === 0 ? CH * 0.78 : CH * 0.22;
    return [x, y];
  };
  const pl: Player[] = Array.from({ length: n }, (_, i) => { const [x, y] = home(i); return { x, y, vx: 0, vy: 0, cool: 0, smash: 0, dashSeen: 0, lastHit: -9 }; });
  const ball: Ball = { x: CW / 2, y: CH * 0.75, z: 220, vx: 0, vy: 0, vz: 0, by: -1, live: false };
  const score = [0, 0];
  let phase: 'serve' | 'play' | 'point' | 'over' = 'serve', timer = 2.2, serveTo = 0, lastPoint = -1, time = 0, over = false;
  const botJitter = new Array<number>(n).fill(0).map(() => (rnd() - 0.5) * 30);
  // How far off a computer player judges each ball (new for every hit), so it misses now and then.
  const botErr = new Array<number>(n).fill(0), botSeen = new Array<number>(n).fill(-2);

  const serve = () => {
    // The team that lost the last point gets the next ball, dropped gently over its own side.
    const mates = pl.map((_, i) => i).filter((i) => teamOf(i) === serveTo);
    const who = mates[Math.floor(rnd() * mates.length)] ?? 0;
    Object.assign(ball, { x: Math.max(60, Math.min(CW - 60, pl[who].x + (rnd() - 0.5) * 80)), y: serveTo === 0 ? CH * 0.72 : CH * 0.28, z: 260, vx: 0, vy: 0, vz: 60, by: -1, live: true });
    phase = 'play';
  };
  // A hit from a player: the ball goes over the net; a smash flies fast and low.
  const hit = (i: number) => {
    const p = pl[i], team = teamOf(i), dir = team === 0 ? -1 : 1;
    const off = (ball.x - p.x) / R; // -1 … 1: which side of the player it touched
    const smash = p.smash > 0 && Math.abs(p.y - NET_Y) < 170;
    const depth = smash ? 0.55 + rnd() * 0.35 : 0.25 + rnd() * 0.6;
    let tx = ball.x - off * CW * 0.55 + (rnd() - 0.5) * 40;
    tx = Math.max(-10, Math.min(CW + 10, tx)); // a wild hit may land out
    const ty = NET_Y + dir * depth * (CH / 2 - 20);
    let T = smash ? 0.55 : 1.15 + rnd() * 0.25;
    const z0 = Math.max(ball.z, 30);
    // Make sure it clears the net.
    for (let k = 0; k < 8; k++) {
      const vz = (0.5 * GRAV * T * T - z0) / T, tc = (NET_Y - ball.y) / ((ty - ball.y) / T);
      const zc = z0 + vz * tc - 0.5 * GRAV * tc * tc;
      if (tc <= 0 || tc >= T || zc > NET_H + BALL + 14) break;
      T += 0.12;
    }
    ball.vx = (tx - ball.x) / T; ball.vy = (ty - ball.y) / T; ball.vz = (0.5 * GRAV * T * T - z0) / T; ball.z = z0;
    ball.by = i; p.lastHit = time; p.smash = 0;
    const [x, y] = c.to2d(ball.x, ball.y, ball.z);
    c.fx.pop(x, y, smash ? '#ff6b5e' : '#ffffff', smash ? 34 : 24);
    if (smash) { c.fx.shake(5, 0.2); sfx.hit(); } else sfx.place();
    if (i === c.seat) buzz(smash ? 40 : 15);
  };
  const point = (team: number) => {
    score[team]++; lastPoint = team; serveTo = 1 - team; ball.live = false; phase = 'point'; timer = 1.8;
    const [x, y] = c.to2d(ball.x, ball.y, 0);
    c.fx.confetti(x, y, [c.colors()[team] ?? '#ffffff', '#ffffff'], 22, 240);
    if (teamOf(c.seat) === team) sfx.good(); else sfx.bad();
    if (score[team] >= WIN) { phase = 'over'; timer = 2.4; sfx.win(); }
  };

  const movePlayers = (dt: number, inputs: ArenaInput[] | null) => {
    pl.forEach((p, i) => {
      p.cool = Math.max(0, p.cool - dt); p.smash = Math.max(0, p.smash - dt);
      if (inputs) {
        const inp = inputs[i];
        const [wx, wy] = wanted(inp, p.x, p.y, SPEED, 26);
        const k = Math.min(1, ACCEL * dt);
        p.vx += (wx - p.vx) * k; p.vy += (wy - p.vy) * k;
        if (inp.dash > p.dashSeen) {
          p.dashSeen = inp.dash;
          if (p.cool <= 0) {
            // A jump towards the ball (or the way it moves); near the net it becomes a smash.
            const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy) || 1;
            p.vx += (dx / d) * DASH; p.vy += (dy / d) * DASH; p.cool = DASH_COOL; p.smash = SMASH_T; sfx.move();
          }
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      // Each team stays on its own side of the net, a little beyond the lines.
      const team = teamOf(i);
      p.x = Math.max(-OUT, Math.min(CW + OUT, p.x));
      if (team === 0) p.y = Math.max(NET_Y + R + 4, Math.min(CH + OUT, p.y)); else p.y = Math.max(-OUT, Math.min(NET_Y - R - 4, p.y));
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pl[i], b = pl[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= R * 2 || d === 0) continue;
      const push = (R * 2 - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push;
    }
  };
  const moveBall = (dt: number, decide: boolean) => {
    if (!ball.live) return;
    const oy = ball.y;
    ball.vz -= GRAV * dt; ball.z += ball.vz * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    // Into the net: it drops on the side it came from.
    if ((oy - NET_Y) * (ball.y - NET_Y) < 0 && ball.z < NET_H) { ball.y = oy; ball.vy *= -0.25; ball.vx *= 0.5; if (decide) sfx.tick(); }
    if (!decide) { if (ball.z < 0) { ball.z = 0; ball.vz = 0; ball.vx = ball.vy = 0; } return; }
    // Hits: whoever is under the ball on its side reaches it.
    if (ball.z < REACH && ball.vz < 60) {
      let best = -1, bestD = R + BALL + 8;
      pl.forEach((p, i) => {
        if (time - p.lastHit < HIT_GAP || teamOf(i) !== (ball.y > NET_Y ? 0 : 1)) return;
        if (ball.by === i) return; // nobody hits twice in a row
        const d = Math.hypot(ball.x - p.x, ball.y - p.y);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) { hit(best); return; }
    }
    if (ball.z <= 0) {
      ball.z = 0;
      const out = ball.x < 0 || ball.x > CW || ball.y < 0 || ball.y > CH;
      // Out: a point against the team that hit it last (if anyone did); in: against the side it fell on.
      if (out && ball.by >= 0) point(1 - teamOf(ball.by));
      else point(ball.y > NET_Y ? 1 : 0);
    }
  };

  const step = (dt: number, inputs: ArenaInput[]) => {
    time += dt;
    if (phase === 'over') { timer -= dt; movePlayers(dt, null); if (timer <= 0) over = true; return; }
    if (phase === 'serve' || phase === 'point') {
      timer -= dt; movePlayers(dt, inputs);
      if (timer <= 0) serve();
      return;
    }
    movePlayers(dt, inputs);
    moveBall(dt, true);
  };

  // The computer: to where the ball will come down on its side (the nearest teammate goes), else home.
  const landing = (): [number, number, number] => {
    // Time until the ball is at hitting height on the way down.
    const h = REACH * 0.6, a = -0.5 * GRAV, b = ball.vz, cc = ball.z - h;
    const disc = b * b - 4 * a * cc;
    const tt = disc < 0 ? 0 : Math.max(0, (-b - Math.sqrt(disc)) / (2 * a));
    return [ball.x + ball.vx * tt, ball.y + ball.vy * tt, tt];
  };
  const bot = (i: number): ArenaInput => {
    const p = pl[i], inp = noInput(), team = teamOf(i);
    inp.dash = p.dashSeen;
    if (!ball.live) { const [hx, hy] = home(i); inp.tx = hx; inp.ty = hy; return inp; }
    const [lx, ly, tt] = landing();
    const mine = team === 0 ? ly > NET_Y : ly < NET_Y;
    if (mine) {
      // The teammate nearest to the landing spot takes it.
      const mates = pl.map((_, k) => k).filter((k) => teamOf(k) === team && !(ball.by === k));
      const go = mates.reduce((bst, k) => (Math.hypot(pl[k].x - lx, pl[k].y - ly) < Math.hypot(pl[bst].x - lx, pl[bst].y - ly) ? k : bst), mates[0] ?? i);
      if (go === i) {
        const shot = ball.by * 1000 + Math.round(ball.vx);
        if (botSeen[i] !== shot) { botSeen[i] = shot; botErr[i] = (rnd() - 0.5) * 100; }
        inp.tx = lx + botErr[i]; inp.ty = ly + botErr[i] * 0.3;
        if (Math.abs(p.y - NET_Y) < 140 && tt < 0.25 && p.cool <= 0 && rnd() < 0.5) inp.dash = p.dashSeen + 1;
        return inp;
      }
    }
    const [hx, hy] = home(i); inp.tx = hx + botJitter[i]; inp.ty = hy;
    return inp;
  };

  const snap = (): Snap => ({
    ph: ['serve', 'play', 'point', 'over'].indexOf(phase), tm: Math.round(timer * 10), sc: [...score], srv: serveTo, last: lastPoint,
    b: [Math.round(ball.x), Math.round(ball.y), Math.round(ball.z), Math.round(ball.vx), Math.round(ball.vy), Math.round(ball.vz), ball.by, ball.live ? 1 : 0],
    pl: pl.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.smash > 0 ? 1 : 0, Math.round(p.cool * 10)]),
  });
  let seenBy = -1, seenScore = '0:0';
  const load = (raw: unknown) => {
    const s = raw as Snap;
    phase = (['serve', 'play', 'point', 'over'] as const)[s.ph] ?? 'play'; timer = s.tm / 10; serveTo = s.srv; lastPoint = s.last;
    const key = s.sc.join(':');
    if (key !== seenScore) {
      seenScore = key;
      if (lastPoint >= 0) { const [x, y] = c.to2d(ball.x, ball.y, 0); c.fx.confetti(x, y, [c.colors()[lastPoint] ?? '#ffffff', '#ffffff'], 22, 240); if (teamOf(c.seat) === lastPoint) sfx.good(); else sfx.bad(); }
    }
    score[0] = s.sc[0]; score[1] = s.sc[1];
    const [bx, by, bz, bvx, bvy, bvz, who, live] = s.b;
    if (who !== seenBy && who >= 0 && live) { const [x, y] = c.to2d(bx, by, bz); c.fx.pop(x, y, '#ffffff', 24); sfx.place(); }
    seenBy = who;
    Object.assign(ball, { x: bx, y: by, z: bz, vx: bvx, vy: bvy, vz: bvz, by: who, live: !!live });
    s.pl.forEach((v, i) => { const p = pl[i]; if (p) Object.assign(p, { x: v[0], y: v[1], vx: v[2], vy: v[3], smash: v[4] ? 0.1 : 0, cool: v[5] / 10 }); });
  };

  const teamName = (team: number) => c.names().filter((_, i) => teamOf(i) === team).map((s) => s.slice(0, 8)).join(' & ');

  return {
    step, bot, snap, load,
    predict(dt) { for (const p of pl) { p.x += p.vx * dt; p.y += p.vy * dt; } moveBall(dt, false); },
    winners: () => (over ? pl.flatMap((_, i) => (teamOf(i) === (score[0] >= WIN ? 0 : 1) ? [i] : [])) : []),
    // The far team looks from the other end, so everyone has their own side near them.
    spin: (seat) => (teamOf(seat) === 1 ? Math.PI : 0),
    render(w, t) {
      const p = w.pal, colors = c.colors();
      // Sand court with white lines and a sea-blue surround.
      w.box(CW / 2, CH / 2, CW + 120, CH + 120, 3, p.dark ? '#22406a' : '#9fd3f0', { z: -6 });
      w.box(CW / 2, CH / 2, CW, CH, 4, p.dark ? '#8b7448' : '#f3dca8', { z: -4 });
      const line = p.white;
      for (const x of [0, CW]) w.box(x, CH / 2, 4, CH, 1, line, { z: 0 });
      for (const y of [0, CH]) w.box(CW / 2, y, CW, 4, 1, line, { z: 0 });
      w.box(CW / 2, NET_Y, CW, 3, 1, line, { z: 0 });
      // Net with two posts.
      for (const x of [-14, CW + 14]) w.box(x, NET_Y, 7, 7, NET_H + 18, p.dark ? '#e9e3ff' : '#55606e');
      w.box(CW / 2, NET_Y, CW + 28, 2.5, NET_H * 0.75, p.dark ? '#ffffff' : '#2b2440', { z: NET_H * 0.25 });
      w.box(CW / 2, NET_Y, CW + 28, 4, 5, p.white, { z: NET_H });
      // Ball and its shadow (smaller and fainter the higher it is).
      if (ball.live || phase === 'point') {
        const k = Math.max(0.35, 1 - ball.z / 420);
        w.disc(ball.x, ball.y, BALL * k, 0.6, p.dark ? '#3a2f1a' : '#c9b07a', 0.2);
        w.ball(ball.x, ball.y, BALL, '#ffffff', ball.z);
        w.disc(ball.x, ball.y, BALL * 0.9, BALL * 0.35, p.sun, ball.z + BALL * 0.85);
      }
      pl.forEach((b, i) => {
        const team = teamOf(i), face = team === 0 ? -1 : 1;
        w.disc(b.x, b.y, R * 0.95, 1, p.dark ? '#3a2f1a' : '#d8bf86', 0.15);
        w.ball(b.x, b.y, R, colors[i], b.smash > 0 ? 10 : 0);
        for (const side of [-1, 1]) w.ball(b.x + side * 7, b.y + face * R * 0.62, 4, '#ffffff', R * 1.15 + (b.smash > 0 ? 10 : 0));
        if (b.cool <= 0) w.disc(b.x, b.y, R * 1.15, 1, colors[i], 0.4);
      });
      void t;
    },
    hud(g: G, w: World) {
      const p = w.pal, names = c.names(), colors = c.colors();
      pl.forEach((b, i) => {
        const [x, y] = w.to2d(b.x, b.y, R * 2.7);
        write(g, p, i === c.seat ? `▼ ${names[i]}` : names[i], x, y, 11, 800, colors[i], 120);
      });
      // The score at the top of the picture: one's own team first.
      const mine = teamOf(c.seat), [sx, sy] = w.to2d(CW / 2, mine === 0 ? -40 : CH + 40, 0);
      label(g, p, `${teamName(mine)}  ${score[mine]} – ${score[1 - mine]}  ${teamName(1 - mine)}`, sx, Math.max(18, sy), 16, p.white, 520);
      const [cx, cy] = w.to2d(CW / 2, NET_Y, NET_H + 40);
      if (phase === 'serve' && time < 2.4) label(g, p, c.t('firstTo', { n: WIN }), cx, cy, 20, p.sun, 420);
      else if (phase === 'point' && lastPoint >= 0) label(g, p, c.t('pointTo', { name: teamName(lastPoint) }), cx, cy, 20, colors[c.names().findIndex((_, i) => teamOf(i) === lastPoint)] ?? p.white, 420);
    },
  };
}
