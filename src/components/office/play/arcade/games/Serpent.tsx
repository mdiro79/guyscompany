'use client';
import { CanvasStage } from '../kit/Stage';
import type { Dir, Game2D, GameApi } from '../kit/types';
import { Fx, TAU, ball, label, scene, shape, star, tile } from '../kit/fx';
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
  return <CanvasStage api={api} size={[W, H]} init={() => create(api)} />;
}

function create(api: GameApi): Game2D {
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
  const hud = () => api.hud(`×${combo}${ghost > 0 ? ' 👻' : ''}`);
  hud();

  const die = () => {
    dead = 0.0001;
    sfx.boom(); buzz(80);
    fx.shake(9, 0.5); fx.blink('#ff6b5e', 0.45);
    const c = theme.get();
    snake.forEach((s, i) => { if (i % 2 === 0) fx.confetti(...px(s), [c.mint, c.sun, c.white], 4, 170); });
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
      fx.burst(...px(head), '#ff6b5e', 10, 150, 3); fx.pop(...px(head), '#ff6b5e', 16);
      fx.text(px(head)[0], px(head)[1] - 14, `+${10 * combo}`, combo > 1 ? '#ffc93c' : '#ffffff', 14 + combo * 2);
      sfx.point(combo * 2 + (eaten % 5)); buzz(8);
      fruit = freeCell(2);
      if (eaten % 4 === 0 && !bonus) { const k = r(); bonus = { ...freeCell(4), kind: k < 0.45 ? 'gold' : k < 0.75 ? 'cut' : 'ghost', ttl: 7 }; }
      if (eaten % 6 === 0 && blocks.size < MAX_BLOCKS) { const b = freeCell(6); blocks.add(b.y * COLS + b.x); fx.pop(...px(b), '#9b6bff', 18); }
    } else if (grow > 0) grow--;
    else snake.pop();
    if (bonus && head.x === bonus.x && head.y === bonus.y) {
      const [bx, by] = px(bonus);
      if (bonus.kind === 'gold') { score += 50 * combo; fx.text(bx, by - 14, `+${50 * combo}`, '#ffc93c', 20); fx.confetti(bx, by, ['#ffc93c', '#ff9f43', '#ffffff'], 18); }
      else if (bonus.kind === 'cut') { const n = Math.min(5, snake.length - 3); for (let i = 0; i < n; i++) { const s = snake.pop()!; fx.burst(...px(s), '#4aa8ff', 6, 120, 2.5); } score += 20; fx.text(bx, by - 14, '✂', '#4aa8ff', 22); }
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
    draw(g, t) {
      const p = theme.get();
      fx.begin(g);
      scene(g, W, H, t, p);
      // Thorn blocks
      for (const b of blocks) {
        const x = (b % COLS) * C, y = Math.floor(b / COLS) * C;
        tile(g, p, x + 2, y + 2, C - 4, C - 4, 5, p.grape, 2, 2);
        g.fillStyle = p.ink; g.fillRect(x + 6, y + 8, 2.5, 2.5); g.fillRect(x + 11.5, y + 8, 2.5, 2.5); g.fillRect(x + 7, y + 13, 6, 1.5);
      }
      // Fruit (an apple with a leaf) and the bonus
      const [fxp, fyp] = px(fruit), bob = Math.sin(t * 5) * 1.2;
      ball(g, p, fxp, fyp + bob, 7, p.coral, 2, 2);
      g.fillStyle = p.mint; g.beginPath(); g.ellipse(fxp + 3, fyp - 8 + bob, 4, 2, -0.6, 0, TAU); g.fill(); g.strokeStyle = p.ink; g.lineWidth = 1.2; g.stroke();
      if (bonus) {
        const [bx, by] = px(bonus), blinkOut = bonus.ttl < 2 && Math.floor(t * 8) % 2 === 0;
        if (!blinkOut) {
          if (bonus.kind === 'gold') shape(g, p, p.sun, () => star(g, bx, by, 10, t * 2), 2, 2);
          else { ball(g, p, bx, by, 8.5, bonus.kind === 'cut' ? p.sky : p.white, 2, 2); label(g, p, bonus.kind === 'cut' ? '✂' : '👻', bx, by + 1, 10, p.white); }
          g.strokeStyle = p.ink; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (bonus.ttl / 7)); g.stroke();
        }
      }
      // The snake: one thick line through its cells, sliding between grid steps, with an ink edge.
      if (!dead || dead < 0.12) {
        const k = dead ? 1 : Math.min(1, acc);
        g.lineCap = 'round'; g.lineJoin = 'round';
        const path = (dy = 0) => {
          g.beginPath();
          const [hx, hy] = px(snake[0]);
          g.moveTo(hx - dir.x * C * (1 - k), hy - dir.y * C * (1 - k) + dy);
          for (let i = 1; i < snake.length; i++) {
            const a = snake[i - 1], b = snake[i];
            let [x, y] = px(b);
            const jump = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1;
            if (i === snake.length - 1 && !jump && grow <= 0) { x += (a.x - b.x) * C * k; y += (a.y - b.y) * C * k; }
            if (jump) g.moveTo(x, y + dy); else g.lineTo(x, y + dy);
          }
        };
        g.globalAlpha = ghost > 0 ? 0.5 + Math.sin(t * 14) * 0.15 : 1;
        g.strokeStyle = p.shadow; g.lineWidth = C - 3; path(3); g.stroke();
        g.strokeStyle = p.ink; g.lineWidth = C - 3; path(); g.stroke();
        g.strokeStyle = ghost > 0 ? p.white : p.mint; g.lineWidth = C - 7; path(); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.setLineDash([2, 12]); path(-3); g.stroke(); g.setLineDash([]);
        g.globalAlpha = 1;
        // Head with eyes and a tongue
        const [hx, hy] = px(snake[0]), ox = hx - dir.x * C * (1 - k), oy = hy - dir.y * C * (1 - k);
        if (Math.floor(t * 2) % 3 === 0) { g.strokeStyle = p.coral; g.lineWidth = 2; g.beginPath(); g.moveTo(ox + dir.x * 9, oy + dir.y * 9); g.lineTo(ox + dir.x * 15, oy + dir.y * 15); g.stroke(); }
        ball(g, p, ox, oy, 10, ghost > 0 ? p.white : p.mint, 2, 0);
        for (const s of [-1, 1]) {
          const ex = ox + dir.x * 3 + dir.y * s * 4.5, ey = oy + dir.y * 3 + dir.x * s * 4.5;
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex, ey, 3.4, 0, TAU); g.fill();
          g.fillStyle = p.ink; g.beginPath(); g.arc(ex + dir.x * 1.2, ey + dir.y * 1.2, 1.7, 0, TAU); g.fill();
        }
      }
      // Combo timer
      if (combo > 1 && !dead) {
        const left = Math.max(0, 1 - (time - lastEat) / COMBO_S);
        g.fillStyle = p.sun; g.fillRect(0, H - 4, W * left, 4);
      }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    key(code, down) { if (down && KEYS[code]) turn(KEYS[code]); },
    swipe: turn,
  };
}
