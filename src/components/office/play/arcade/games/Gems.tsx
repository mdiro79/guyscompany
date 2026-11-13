'use client';
import { CanvasStage } from '../kit/Stage';
import type { Dir, Game2D, GameApi } from '../kit/types';
import { Fx, TAU, label, rrect, scene, shape, star, tile } from '../kit/fx';
import { theme, type Palette } from '../kit/theme';
import { rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Gem Cascade. Swap two neighbouring gems to line up three or more of a kind; they pop, the ones above
// fall and new ones drop in, which can set off chains (each step of a chain multiplies the points).
// A line of four clears its whole row or column, a line of five every gem of that kind. 75 seconds;
// lines of four and five add a little time. When no move is left the board is shuffled.

const COLS = 7, ROWS = 8, C = 46, W = 360, LEFT = (W - COLS * C) / 2, TOP = 64, H = TOP + ROWS * C + 16, KINDS = 6, ROUND_S = 75;
type Phase = 'idle' | 'swap' | 'back' | 'pop' | 'fall';
const at = (c: number, r: number) => r * COLS + c;
const DIRS: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Cells to clear for the lines on a board, and how long the longest line is. Pure, so it can be tested. */
export function matches(b: number[], cols = COLS, rows = ROWS) {
  const clear = new Set<number>();
  let longest = 0;
  const run = (cells: number[], horizontal: boolean) => {
    if (cells.length < 3) return;
    longest = Math.max(longest, cells.length);
    cells.forEach((i) => clear.add(i));
    const kind = b[cells[0]];
    if (cells.length >= 5) b.forEach((k, i) => { if (k === kind) clear.add(i); });
    else if (cells.length === 4) {
      if (horizontal) { const r = Math.floor(cells[0] / cols); for (let c = 0; c < cols; c++) clear.add(r * cols + c); }
      else { const c = cells[0] % cols; for (let r = 0; r < rows; r++) clear.add(r * cols + c); }
    }
  };
  for (let r = 0; r < rows; r++) for (let c = 0, start = 0; c <= cols; c++) {
    if (c === cols || b[r * cols + c] !== b[r * cols + start] || b[r * cols + c] < 0) { if (b[r * cols + start] >= 0) run(Array.from({ length: c - start }, (_, i) => r * cols + start + i), true); start = c; }
  }
  for (let c = 0; c < cols; c++) for (let r = 0, start = 0; r <= rows; r++) {
    if (r === rows || b[r * cols + c] !== b[start * cols + c] || b[r * cols + c] < 0) { if (b[start * cols + c] >= 0) run(Array.from({ length: r - start }, (_, i) => (start + i) * cols + c), false); start = r; }
  }
  return { clear, longest };
}
/** A swap that makes a line, as [cell, neighbour], or null when there is none. */
export function findMove(b: number[], cols = COLS, rows = ROWS): [number, number] | null {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
    if (c + dc >= cols || r + dr >= rows) continue;
    const i = r * cols + c, j = (r + dr) * cols + c + dc;
    [b[i], b[j]] = [b[j], b[i]];
    const ok = matches(b.slice(), cols, rows).clear.size > 0;
    [b[i], b[j]] = [b[j], b[i]];
    if (ok) return [i, j];
  }
  return null;
}

export default function Gems({ api }: { api: GameApi }) {
  return <CanvasStage api={api} size={[W, H]} init={() => create(api)} />;
}

function create(api: GameApi): Game2D {
  const r = rng(api.seed), fx = new Fx();
  let b: number[] = [];
  const off = new Float32Array(COLS * ROWS); // how far above its cell a gem still is (falling)
  let phase: Phase = 'idle', anim = 0, sel = -1, pair: [number, number] = [-1, -1], popping = new Set<number>(), chain = 0;
  let score = 0, left = ROUND_S, idle = 0, ended = false, note = 0, down = -1;

  const fill = () => {
    do {
      b = Array.from({ length: COLS * ROWS }, () => Math.floor(r() * KINDS));
      // No ready-made lines at the start.
      for (let guard = 0; guard < 200 && matches(b.slice()).clear.size; guard++) for (const i of matches(b.slice()).clear) b[i] = Math.floor(r() * KINDS);
    } while (matches(b.slice()).clear.size || !findMove(b));
  };
  fill();
  const center = (i: number) => [LEFT + (i % COLS) * C + C / 2, TOP + Math.floor(i / COLS) * C + C / 2] as const;
  const cellAt = (x: number, y: number) => { const c = Math.floor((x - LEFT) / C), rr = Math.floor((y - TOP) / C); return c >= 0 && c < COLS && rr >= 0 && rr < ROWS ? at(c, rr) : -1; };
  const hud = () => api.hud(api.t('time', { n: Math.max(0, Math.ceil(left)) }));
  hud();

  const trySwap = (i: number, j: number) => {
    if (phase !== 'idle' || i < 0 || j < 0 || left <= 0) return;
    const dc = Math.abs((i % COLS) - (j % COLS)), dr = Math.abs(Math.floor(i / COLS) - Math.floor(j / COLS));
    if (dc + dr !== 1) return;
    [b[i], b[j]] = [b[j], b[i]];
    pair = [i, j]; anim = 0; sel = -1; idle = 0; chain = 0;
    phase = matches(b.slice()).clear.size ? 'swap' : 'back';
    if (phase === 'back') { sfx.bad(); buzz(20); } else sfx.move();
  };
  const resolve = () => {
    const m = matches(b.slice());
    if (!m.clear.size) {
      phase = 'idle';
      if (!findMove(b)) { fill(); off.fill(0); note = 1.6; sfx.good(); }
      return;
    }
    chain++;
    popping = m.clear; phase = 'pop'; anim = 0;
    const pts = m.clear.size * 10 * chain;
    score += pts; api.score(score);
    if (m.longest >= 4) { left = Math.min(90, left + (m.longest >= 5 ? 4 : 2)); fx.blink('#ffffff', 0.25); fx.shake(4, 0.2); }
    const p = theme.get(), colors = palette(p);
    let sx = 0, sy = 0;
    for (const i of m.clear) { const [x, y] = center(i); sx += x; sy += y; fx.burst(x, y, colors[b[i]], 4, 130, 3, 0.45); }
    fx.text(sx / m.clear.size, sy / m.clear.size, `+${pts}`, chain > 1 ? p.sun : p.white, 15 + Math.min(12, chain * 3));
    if (chain > 1) fx.text(W / 2, TOP - 24, `×${chain}`, p.coral, 24);
    sfx.point(chain * 3 + m.longest); buzz(10);
  };
  const collapse = () => {
    for (const i of popping) b[i] = -1;
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let rr = ROWS - 1; rr >= 0; rr--) {
        const k = b[at(c, rr)];
        if (k < 0) continue;
        if (write !== rr) { b[at(c, write)] = k; b[at(c, rr)] = -1; off[at(c, write)] = off[at(c, rr)] + (write - rr) * C; off[at(c, rr)] = 0; }
        write--;
      }
      for (let rr = write, n = 1; rr >= 0; rr--, n++) { b[at(c, rr)] = Math.floor(r() * KINDS); off[at(c, rr)] = (write + 1) * C + n * 6; }
    }
    popping = new Set(); phase = 'fall';
  };

  return {
    step(dt) {
      fx.step(dt);
      note = Math.max(0, note - dt);
      if (left > 0) { left -= dt; hud(); if (left <= 10 && Math.ceil(left) !== Math.ceil(left + dt)) sfx.tick(); }
      if (left <= 0 && phase === 'idle' && !ended) { ended = true; api.end(score); return; }
      anim += dt;
      if (phase === 'swap' && anim >= 0.14) resolve();
      else if (phase === 'back' && anim >= 0.28) { [b[pair[0]], b[pair[1]]] = [b[pair[1]], b[pair[0]]]; phase = 'idle'; }
      else if (phase === 'pop' && anim >= 0.2) collapse();
      else if (phase === 'fall') {
        let moving = false;
        for (let i = 0; i < off.length; i++) if (off[i] > 0) { off[i] = Math.max(0, off[i] - (520 + off[i] * 6) * dt); moving ||= off[i] > 0; }
        if (!moving) resolve();
      } else if (phase === 'idle') idle += dt;
    },
    draw(g, t) {
      const p = theme.get(), colors = palette(p);
      fx.begin(g);
      scene(g, W, H, t, p);
      // Time
      tile(g, p, LEFT, 22, COLS * C, 16, 8, p.paper, 2, 2);
      const k = Math.max(0, Math.min(1, left / ROUND_S));
      if (k > 0) { g.fillStyle = left < 10 ? p.coral : p.mint; rrect(g, LEFT + 3, 25, (COLS * C - 6) * k, 10, 5); g.fill(); }
      // Board
      tile(g, p, LEFT - 6, TOP - 6, COLS * C + 12, ROWS * C + 12, 14, p.paper2, 2, 4);
      const hint = phase === 'idle' && idle > 6 ? findMove(b) : null;
      g.save(); rrect(g, LEFT - 4, TOP - 4, COLS * C + 8, ROWS * C + 8, 12); g.clip();
      for (let i = 0; i < b.length; i++) {
        if (b[i] < 0) continue;
        let [x, y] = center(i), s = 1;
        y -= off[i];
        const swapping = (phase === 'swap' || phase === 'back') && (i === pair[0] || i === pair[1]);
        if (swapping) {
          const other = center(i === pair[0] ? pair[1] : pair[0]);
          const u = phase === 'swap' ? 1 - Math.min(1, anim / 0.14) : anim < 0.14 ? 1 - anim / 0.14 : (anim - 0.14) / 0.14;
          x += (other[0] - x) * u; y += (other[1] - y) * u;
        }
        if (phase === 'pop' && popping.has(i)) s = Math.max(0, 1 - anim / 0.2) * 1.15;
        if (i === sel) s = 1.12 + Math.sin(t * 10) * 0.04;
        if (hint && (i === hint[0] || i === hint[1])) s = 1 + Math.sin(t * 8) * 0.08;
        gem(g, p, b[i], x, y, C * 0.37 * s, colors[b[i]]);
      }
      g.restore();
      if (sel >= 0) { const [x, y] = center(sel); g.strokeStyle = p.text; g.lineWidth = 3; rrect(g, x - C / 2 + 2, y - C / 2 + 2, C - 4, C - 4, 10); g.stroke(); }
      if (note > 0) { g.globalAlpha = Math.min(1, note); label(g, p, api.t('shuffle'), W / 2, TOP + (ROWS * C) / 2, 18, p.sun, W - 40); g.globalAlpha = 1; }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    pointer(e) { if (e.type === 'down') down = cellAt(e.x, e.y); },
    swipe(d) {
      if (down < 0) return;
      const c = (down % COLS) + DIRS[d][0], rr = Math.floor(down / COLS) + DIRS[d][1];
      if (c >= 0 && c < COLS && rr >= 0 && rr < ROWS) trySwap(down, at(c, rr));
      down = -1;
    },
    tap(x, y) {
      const i = cellAt(x, y);
      if (i < 0 || phase !== 'idle') { sel = -1; return; }
      if (sel >= 0 && sel !== i && Math.abs((sel % COLS) - (i % COLS)) + Math.abs(Math.floor(sel / COLS) - Math.floor(i / COLS)) === 1) trySwap(sel, i);
      else { sel = sel === i ? -1 : i; sfx.tick(); }
    },
  };
}

const palette = (p: Palette) => [p.coral, p.sky, p.sun, p.mint, p.grape, p.pink];
// Every kind has its own shape as well as its own colour.
function gem(g: CanvasRenderingContext2D, p: Palette, kind: number, x: number, y: number, r: number, color: string) {
  if (r <= 0.5) return;
  const poly = (n: number, rot: number) => () => { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); };
  const path = kind === 0 ? () => { g.beginPath(); g.arc(x, y, r * 0.92, 0, TAU); }
    : kind === 1 ? () => rrect(g, x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, r * 0.3)
      : kind === 2 ? poly(3, -Math.PI / 2)
        : kind === 3 ? poly(4, 0)
          : kind === 4 ? () => star(g, x, y, r * 1.08)
            : poly(6, 0);
  shape(g, p, color, path, 2, 2.5);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.26, r * 0.14, -0.6, 0, TAU); g.fill();
}
