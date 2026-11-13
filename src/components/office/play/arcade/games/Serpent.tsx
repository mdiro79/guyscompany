'use client';
import { WorldStage, type Game3 } from '../kit/World';
import type { Dir, GameApi } from '../kit/types';
import { Fx } from '../kit/fx';
import { theme } from '../kit/theme';
import { rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Hungry Serpent. A cheerful snake on a field whose edges wrap around. Fruit makes it longer and faster;
// eating again within a moment builds a multiplier (up to ×5). Every few fruits a bonus appears for a
// short time (gold: big points, scissors: cuts the tail, ghost: pass through yourself for a while), and
// firewall blocks start to grow on the field. Touching a block or your own body ends the round.

const COLS = 18, ROWS = 27, C = 20, W = COLS * C, H = ROWS * C;
type P = { x: number; y: number };
type BonusKind = 'gold' | 'cut' | 'ghost';
const DIRS: Record<Dir, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const KEYS: Record<string, Dir> = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const COMBO_S = 2.6, MAX_BLOCKS = 16;

export default function Serpent({ api }: { api: GameApi }) {
  return <WorldStage api={api} size={[W, H]} init={(w) => { w.tilt = 0.22; return create(api); }} />;
}

function create(api: GameApi): Game3 {
  const r = rng(api.seed), fx = new Fx();
  const snake: P[] = [{ x: 9, y: 14 }, { x: 9, y: 15 }, { x: 9, y: 16 }];
  let dir = DIRS.up;
  const queue: P[] = [];
  const blocks = new Set<number>();
  let acc = 0, score = 0, eaten = 0, combo = 1, lastEat = -9, time = 0, dead = 0, ended = false, ghost = 0, grow = 0;
  let bonus: (P & { kind: BonusKind; ttl: number }) | null = null;

  const taken = (x: number, y: number) => blocks.has(y * COLS + x) || snake.some((s) => s.x === x && s.y === y) || (bonus?.x === x && bonus.y === y);
  const freeCell = (far = 0): P => {
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(r() * COLS), y = Math.floor(r() * ROWS);
      if (!taken(x, y) && Math.abs(x - snake[0].x) + Math.abs(y - snake[0].y) >= far) return { x, y };
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken(x, y)) return { x, y };
    return { x: 0, y: 0 };
  };
  let fruit = freeCell(3);
  const px = (p: P) => [p.x * C + C / 2, p.y * C + C / 2] as const;
  // Where a cell is on the screen (for effects drawn over the 3D picture).
  let proj: (x: number, y: number, z?: number) => [number, number] = (x, y) => [x, y];
  const at = (p: P, z = 6) => proj(...px(p), z);
  const hud = () => api.hud(`×${combo}${ghost > 0 ? ' 👻' : ''}`);
  hud();

  const die = () => {
    dead = 0.0001;
    sfx.boom(); buzz(80);
    fx.shake(9, 0.5); fx.blink('#ff6b5e', 0.45);
    const c = theme.get();
    snake.forEach((s, i) => { if (i % 2 === 0) fx.confetti(...at(s), [c.mint, c.sun, c.white], 4, 170); });
  };

  const tick = () => {
    while (queue.length) {
      const n = queue.shift()!;
      if (n.x !== -dir.x || n.y !== -dir.y) { dir = n; break; }
    }
    const head = { x: (snake[0].x + dir.x + COLS) % COLS, y: (snake[0].y + dir.y + ROWS) % ROWS };
    // The tail's last cell is free again by the time the head arrives (unless the snake is growing).
    const body = grow > 0 ? snake : snake.slice(0, -1);
    if (blocks.has(head.y * COLS + head.x) || (ghost <= 0 && body.some((s) => s.x === head.x && s.y === head.y))) { die(); return; }
    snake.unshift(head);
    if (head.x === fruit.x && head.y === fruit.y) {
      eaten++;
      combo = time - lastEat < COMBO_S ? Math.min(5, combo + 1) : 1;
      lastEat = time;
      score += 10 * combo;
      fx.burst(...at(head), '#ff6b5e', 10, 150, 3); fx.pop(...at(head), '#ff6b5e', 16);
      fx.text(at(head)[0], at(head)[1] - 16, `+${10 * combo}`, combo > 1 ? '#ffc93c' : '#ffffff', 14 + combo * 2);
      sfx.point(combo * 2 + (eaten % 5)); buzz(8);
      fruit = freeCell(2);
      if (eaten % 4 === 0 && !bonus) { const k = r(); bonus = { ...freeCell(4), kind: k < 0.45 ? 'gold' : k < 0.75 ? 'cut' : 'ghost', ttl: 7 }; }
      if (eaten % 6 === 0 && blocks.size < MAX_BLOCKS) { const b = freeCell(6); blocks.add(b.y * COLS + b.x); fx.pop(...at(b), '#9b6bff', 22); }
    } else if (grow > 0) grow--;
    else snake.pop();
    if (bonus && head.x === bonus.x && head.y === bonus.y) {
      const [bx, by] = at(bonus, 10);
      if (bonus.kind === 'gold') { score += 50 * combo; fx.text(bx, by - 14, `+${50 * combo}`, '#ffc93c', 20); fx.confetti(bx, by, ['#ffc93c', '#ff9f43', '#ffffff'], 18); }
      else if (bonus.kind === 'cut') { const n = Math.min(5, snake.length - 3); for (let i = 0; i < n; i++) { const s = snake.pop()!; fx.burst(...at(s), '#4aa8ff', 6, 120, 2.5); } score += 20; fx.text(bx, by - 14, '✂', '#4aa8ff', 22); }
      else { ghost = 6; fx.text(bx, by - 14, '👻', '#ffffff', 22); fx.pop(bx, by, '#ffffff', 26); }
      sfx.great(); buzz(20);
      bonus = null;
    }
    api.score(score);
    hud();
  };

  const turn = (d: Dir) => {
    const n = DIRS[d], last = queue[queue.length - 1] ?? dir;
    if (queue.length < 3 && !(n.x === last.x && n.y === last.y) && !(n.x === -last.x && n.y === -last.y)) queue.push(n);
  };

  return {
    step(dt) {
      time += dt;
      fx.step(dt);
      if (dead) { dead += dt; if (dead > 1.1 && !ended) { ended = true; api.end(score); } return; }
      if (ghost > 0) { ghost = Math.max(0, ghost - dt); if (ghost === 0) hud(); }
      if (combo > 1 && time - lastEat > COMBO_S) { combo = 1; hud(); }
      if (bonus) { bonus.ttl -= dt; if (bonus.ttl <= 0) bonus = null; }
      acc += dt * (7 + Math.min(7, eaten * 0.16));
      while (acc >= 1 && !dead) { acc -= 1; tick(); }
    },
    render(w, t) {
      const p = w.pal;
      proj = w.to2d;
      // The field: stripes of two greens, a rim around it.
      for (let r = 0; r < ROWS; r++) w.box(W / 2, r * C + C / 2, W, C, 4, r % 2 ? (p.dark ? '#2e5c4a' : '#bfe6b5') : (p.dark ? '#2a5444' : '#b2dea8'), { z: -4 });
      const rim = p.dark ? '#4a3f78' : '#f0e2c8';
      for (const x of [-4, W + 4]) w.box(x, H / 2, 8, H + 16, 6, rim);
      for (const y of [-4, H + 4]) w.box(W / 2, y, W, 8, 6, rim);
      // Grumpy blocks
      for (const b of blocks) { const x = (b % COLS) * C + C / 2, y = Math.floor(b / COLS) * C + C / 2; w.box(x, y, C - 3, C - 3, 15, p.grape); w.box(x, y, C - 7, C - 7, 2, p.dark ? '#7a52d6' : '#b593ff', { z: 15 }); }
      // Apple with a leaf, and the bonus floating above its cell
      const [fxp, fyp] = px(fruit), bob = 2 + Math.sin(t * 5) * 1.5;
      w.ball(fxp, fyp, 7, p.coral, bob);
      w.box(fxp + 2, fyp - 2, 6, 3, 1.5, p.mint, { z: bob + 14, rot: 0.6 });
      if (bonus && !(bonus.ttl < 2 && Math.floor(t * 8) % 2 === 0)) {
        const [bx, by] = px(bonus);
        w.disc(bx, by, 8, 0.4, p.dark ? '#00000055' : '#00000022', 0.05);
        w.ball(bx, by, 8, bonus.kind === 'gold' ? p.sun : bonus.kind === 'cut' ? p.sky : p.white, 6 + Math.sin(t * 6) * 2);
      }
      // The snake: a bead on every cell and a link between neighbours; the head slides between cells.
      if (!dead || dead < 0.12) {
        const k = dead ? 1 : Math.min(1, acc);
        const body = ghost > 0 ? p.white : p.mint, body2 = ghost > 0 ? '#e6e6ff' : p.teal;
        const spots = snake.map((c, i) => {
          let [x, y] = px(c);
          if (i === 0) { x -= dir.x * C * (1 - k); y -= dir.y * C * (1 - k); }
          else if (i === snake.length - 1 && grow <= 0) { const a = snake[i - 1]; if (Math.abs(a.x - c.x) + Math.abs(a.y - c.y) === 1) { x += (a.x - c.x) * C * k; y += (a.y - c.y) * C * k; } }
          return [x, y] as const;
        });
        for (let i = 1; i < spots.length; i++) {
          const [x0, y0] = spots[i - 1], [x1, y1] = spots[i], len = Math.hypot(x1 - x0, y1 - y0);
          if (len > C * 1.5) continue; // through the edge
          w.box((x0 + x1) / 2, (y0 + y1) / 2, len, C * 0.62, C * 0.55, i % 2 ? body : body2, { rot: Math.atan2(y1 - y0, x1 - x0) });
        }
        spots.forEach(([x, y], i) => { if (i) w.ball(x, y, C * 0.4 - Math.min(3, i * 0.05), i % 2 ? body : body2); });
        const [hx, hy] = spots[0];
        w.ball(hx, hy, C * 0.52, body);
        for (const sd of [-1, 1]) {
          const ex = hx + dir.x * 4 + dir.y * sd * 5, ey = hy + dir.y * 4 + dir.x * sd * 5;
          w.ball(ex, ey, 3.4, '#ffffff', C * 0.62);
          w.ball(ex + dir.x * 1.6, ey + dir.y * 1.6, 1.7, p.dark ? '#0e0a1c' : '#2b2440', C * 0.62 + 2.2);
        }
        if (Math.floor(t * 2) % 3 === 0) w.box(hx + dir.x * 13, hy + dir.y * 13, dir.x ? 8 : 2, dir.y ? 8 : 2, 1, p.coral, { z: 4 });
      }
    },
    hud(g, w, t) {
      const p = w.pal;
      fx.begin(g);
      if (bonus && !(bonus.ttl < 2 && Math.floor(t * 8) % 2 === 0)) {
        const [bx, by] = w.to2d(...px(bonus), 24);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '16px serif';
        g.fillText(bonus.kind === 'gold' ? '★' : bonus.kind === 'cut' ? '✂' : '👻', bx, by);
        g.strokeStyle = p.ink; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (bonus.ttl / 7)); g.stroke();
      }
      if (combo > 1 && !dead) {
        const left = Math.max(0, 1 - (time - lastEat) / COMBO_S), Wc = g.canvas.clientWidth, Hc = g.canvas.clientHeight;
        g.fillStyle = p.sun; g.fillRect(0, Hc - 5, Wc * left, 5);
      }
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    key(code, down) { if (down && KEYS[code]) turn(KEYS[code]); },
    swipe: turn,
  };
}
