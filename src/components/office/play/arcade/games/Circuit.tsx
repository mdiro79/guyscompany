'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D, GameApi } from '../kit/types';
import { Fx, TAU, ball, label, rrect, scene, tile } from '../kit/fx';
import { theme } from '../kit/theme';
import { rng, type Rnd } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Bright Circuit. A grid of wire pieces, each turned the wrong way. Tapping a piece turns it a quarter;
// the goal is to connect every piece to the power source so that all of them light up. A solved circuit
// gives points (more for speed) and extra time, and the next circuit is bigger. The round ends when the
// clock runs out.

const W = 360, BOARD = 336, LEFT = 12, TOP = 56, H = TOP + BOARD + 16, START_S = 70, BONUS_S = 12;
const N = 1, E = 2, S = 4, WEST = 8;
const SIDES: [number, number, number, number][] = [[N, 0, -1, S], [E, 1, 0, WEST], [S, 0, 1, N], [WEST, -1, 0, E]]; // side, dx, dy, the neighbour's facing side
export const turn = (m: number) => ((m << 1) & 15) | (m >> 3);

/** A random circuit of n×n pieces that all connect (a tree), as bit masks of the sides each piece joins. */
export function wire(n: number, r: Rnd): { masks: number[]; source: number } {
  const masks = new Array<number>(n * n).fill(0), seen = new Array<boolean>(n * n).fill(false);
  const source = Math.floor(r() * n * n), stack = [source];
  seen[source] = true;
  while (stack.length) {
    // Mostly grows from the newest piece, sometimes from an older one: winding wires with side branches.
    const from = stack[r() < 0.7 ? stack.length - 1 : Math.floor(r() * stack.length)];
    const x = from % n, y = Math.floor(from / n);
    const open = SIDES.filter(([, dx, dy]) => x + dx >= 0 && x + dx < n && y + dy >= 0 && y + dy < n && !seen[(y + dy) * n + x + dx]);
    if (!open.length) { stack.splice(stack.indexOf(from), 1); continue; }
    const [side, dx, dy, back] = open[Math.floor(r() * open.length)], to = (y + dy) * n + x + dx;
    masks[from] |= side; masks[to] |= back; seen[to] = true; stack.push(to);
  }
  return { masks, source };
}
/** Which pieces carry power from the source. */
export function powered(masks: number[], n: number, source: number): boolean[] {
  const on = new Array<boolean>(n * n).fill(false), todo = [source];
  on[source] = true;
  while (todo.length) {
    const i = todo.pop()!, x = i % n, y = Math.floor(i / n);
    for (const [side, dx, dy, back] of SIDES) {
      if (!(masks[i] & side) || x + dx < 0 || x + dx >= n || y + dy < 0 || y + dy >= n) continue;
      const j = (y + dy) * n + x + dx;
      if (!on[j] && masks[j] & back) { on[j] = true; todo.push(j); }
    }
  }
  return on;
}

export default function Circuit({ api }: { api: GameApi }) {
  return <CanvasStage api={api} size={[W, H]} init={() => create(api)} />;
}

function create(api: GameApi): Game2D {
  const r = rng(api.seed), fx = new Fx();
  let level = 0, n = 4, masks: number[] = [], source = 0, on: boolean[] = [], angle: number[] = [];
  let left = START_S, score = 0, solved = 0, ended = false, startedAt = 0, time = 0;
  const sizeOf = (lv: number) => Math.min(7, 4 + Math.floor((lv - 1) / 2));
  const cell = () => BOARD / n;
  const hud = () => api.hud(api.t('hud', { n: level, s: Math.max(0, Math.ceil(left)) }));

  const build = () => {
    level++; n = sizeOf(level);
    const w = wire(n, r);
    source = w.source;
    do { masks = w.masks.map((m) => { let k = m; for (let i = Math.floor(r() * 4); i > 0; i--) k = turn(k); return k; }); on = powered(masks, n, source); } while (on.every(Boolean));
    angle = masks.map(() => 0);
    startedAt = time; solved = 0;
    hud();
  };
  build();

  return {
    step(dt) {
      time += dt;
      fx.step(dt);
      for (let i = 0; i < angle.length; i++) angle[i] *= Math.exp(-dt * 18);
      if (solved > 0) { solved -= dt; if (solved <= 0) build(); return; }
      if (ended) return;
      left -= dt;
      if (Math.ceil(left) !== Math.ceil(left + dt)) { hud(); if (left <= 10) sfx.tick(); }
      if (left <= 0) { ended = true; api.end(score); }
    },
    draw(g, t) {
      const p = theme.get(), c = cell();
      fx.begin(g);
      scene(g, W, H, t, p);
      tile(g, p, LEFT, 22, BOARD, 16, 8, p.paper, 2, 2);
      const k = Math.max(0, Math.min(1, left / START_S));
      if (k > 0) { g.fillStyle = left < 10 ? p.coral : p.teal; rrect(g, LEFT + 3, 25, (BOARD - 6) * k, 10, 5); g.fill(); }
      tile(g, p, LEFT - 6, TOP - 6, BOARD + 12, BOARD + 12, 14, p.paper2, 2, 4);
      const wireW = Math.max(6, c * 0.2);
      for (let i = 0; i < masks.length; i++) {
        const x = LEFT + (i % n) * c, y = TOP + Math.floor(i / n) * c, cx = x + c / 2, cy = y + c / 2, lit = on[i];
        g.fillStyle = p.paper; rrect(g, x + 2, y + 2, c - 4, c - 4, 8); g.fill();
        g.strokeStyle = p.line; g.lineWidth = 1.5; g.stroke();
        g.save(); g.translate(cx, cy); g.rotate(angle[i]);
        const arms = SIDES.filter(([side]) => masks[i] & side);
        const stroke = (color: string, width: number) => {
          g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'butt'; g.lineJoin = 'round';
          g.beginPath(); for (const [, dx, dy] of arms) { g.moveTo(0, 0); g.lineTo(dx * c / 2, dy * c / 2); } g.stroke();
        };
        stroke(p.ink, wireW + 4);
        stroke(lit ? (Math.sin(t * 6 - (i % n) - Math.floor(i / n)) > 0.6 ? p.white : p.sun) : p.dark ? '#5a4f85' : '#cfc5b6', wireW);
        g.restore();
        if (i === source) { ball(g, p, cx, cy, c * 0.27, p.sun, 2, 2); label(g, p, '⚡', cx, cy + 1, c * 0.26, p.white); }
        else if (arms.length === 1) { ball(g, p, cx, cy, c * 0.2, lit ? p.mint : p.paper2, 2, lit ? 2 : 0); if (lit) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(cx, cy, c * 0.07, 0, TAU); g.fill(); } }
        else { g.fillStyle = p.ink; g.beginPath(); g.arc(cx, cy, wireW / 2 + 2, 0, TAU); g.fill(); g.fillStyle = lit ? p.sun : p.dark ? '#5a4f85' : '#cfc5b6'; g.beginPath(); g.arc(cx, cy, wireW / 2, 0, TAU); g.fill(); }
      }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    tap(x, y) {
      if (ended || solved > 0) return;
      const c = cell(), cx = Math.floor((x - LEFT) / c), cy = Math.floor((y - TOP) / c);
      if (cx < 0 || cx >= n || cy < 0 || cy >= n) return;
      const i = cy * n + cx;
      masks[i] = turn(masks[i]);
      angle[i] -= Math.PI / 2;
      const before = on.filter(Boolean).length;
      on = powered(masks, n, source);
      const now = on.filter(Boolean).length;
      if (now > before) sfx.point(now); else sfx.tick();
      if (on.every(Boolean)) {
        const quick = Math.max(0, Math.round(30 - (time - startedAt))) * 5;
        const pts = 100 * level + quick;
        score += pts; api.score(score);
        left = Math.min(120, left + BONUS_S);
        solved = 0.9;
        const p = theme.get();
        fx.confetti(W / 2, TOP + BOARD / 2, [p.sun, p.mint, p.sky, p.pink], 46, 330);
        fx.text(W / 2, TOP + BOARD / 2, `+${pts}`, p.sun, 30);
        sfx.great(); buzz(30);
      }
    },
  };
}
