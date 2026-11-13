'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D, GameApi } from '../kit/types';
import { Fx, TAU, ball, label, rrect, scene, shape, tile, write } from '../kit/fx';
import { theme } from '../kit/theme';
import { clamp, rng, shuffle } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Star Swarm. A small ship in a field of enemies that keep coming. The ship fires by itself at the
// nearest enemy; the player only steers. Fallen enemies leave blue shards; enough shards raise the level
// and offer one of three upgrades. Three hearts; waves grow faster and bigger with time. The score is
// the enemies destroyed plus the seconds survived.

type Kind = 'drone' | 'tank' | 'dart';
interface Enemy { x: number; y: number; vx: number; vy: number; r: number; hp: number; max: number; kind: Kind; hit: number; blade: number }
interface Shot { x: number; y: number; vx: number; vy: number; life: number; pierce: number; seen: Enemy[] }
interface Shard { x: number; y: number; v: number; pull: boolean }
type Up = 'upRate' | 'upDamage' | 'upMulti' | 'upSpeed' | 'upMagnet' | 'upBlades' | 'upHeal' | 'upPierce';
const UP_ICON: Record<Up, string> = { upRate: '⚡', upDamage: '💥', upMulti: '🔱', upSpeed: '🚀', upMagnet: '🧲', upBlades: '🌀', upHeal: '❤️', upPierce: '🎯' };
const MAX_ENEMIES = 70, MAX_SHOTS = 70;

export default function Swarm({ api }: { api: GameApi }) {
  const size: [number, number] = api.phone ? [360, 600] : [720, 480];
  return <CanvasStage api={api} size={size} init={({ w, h }) => create(api, w, h)} />;
}

function create(api: GameApi, W: number, H: number): Game2D {
  const r = rng(api.seed), fx = new Fx();
  const p = { x: W / 2, y: H / 2, r: 9, hp: 3, inv: 0, aim: -Math.PI / 2 };
  const stat = { every: 0.42, damage: 1, multi: 1, speed: 195, magnet: 48, blades: 0, pierce: 0 };
  const taken: Partial<Record<Up, number>> = {};
  const enemies: Enemy[] = [];
  let shots: Shot[] = [], shards: Shard[] = [];
  let time = 0, fire = 0, spawn = 0.5, kills = 0, xp = 0, level = 1, dead = 0, ended = false, grace = 0;
  let choice: Up[] | null = null;
  let target: { x: number; y: number } | null = null, drag: { fx: number; fy: number; px: number; py: number } | null = null;
  const keys = { l: false, r: false, u: false, d: false };
  const stars = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random() * 1.4 }));
  const need = () => 4 + level * 3;
  const score = () => kills + Math.floor(time) * 5;
  const hud = () => api.hud(`${'♥'.repeat(Math.max(0, p.hp))} · ${api.t('level', { n: level })}`);
  hud();

  const spawnEnemy = () => {
    if (enemies.length >= MAX_ENEMIES) return;
    const side = Math.floor(r() * 4), m = 24;
    const x = side === 0 ? -m : side === 1 ? W + m : r() * W, y = side === 2 ? -m : side === 3 ? H + m : r() * H;
    const k = r(), tough = Math.floor(time / 45);
    const kind: Kind = time > 35 && k < 0.16 ? 'dart' : time > 15 && k < 0.16 + Math.min(0.2, time / 400) ? 'tank' : 'drone';
    const hp = kind === 'tank' ? 4 + tough * 2 : kind === 'dart' ? 1 + Math.floor(tough / 2) : 1 + Math.floor(tough / 2);
    const e: Enemy = { x, y, vx: 0, vy: 0, r: kind === 'tank' ? 15 : kind === 'dart' ? 7 : 9, hp, max: hp, kind, hit: 0, blade: 0 };
    if (kind === 'dart') { const a = Math.atan2(p.y - y, p.x - x); e.vx = Math.cos(a) * 170; e.vy = Math.sin(a) * 170; }
    enemies.push(e);
  };
  const kill = (e: Enemy) => {
    kills += e.kind === 'tank' ? 30 : e.kind === 'dart' ? 15 : 10;
    const c = e.kind === 'tank' ? '#ff9f43' : e.kind === 'dart' ? '#ffc93c' : '#ff6b5e';
    fx.burst(e.x, e.y, c, e.kind === 'tank' ? 16 : 7, e.kind === 'tank' ? 220 : 150, 3.5, 0.5); fx.pop(e.x, e.y, c, e.r * 2.2);
    if (e.kind === 'tank') { fx.shake(4, 0.15); sfx.hit(); } else sfx.tick();
    const n = e.kind === 'tank' ? 3 : 1;
    for (let i = 0; i < n; i++) if (shards.length < 90) shards.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y + (Math.random() - 0.5) * 14, v: 1, pull: false });
    api.score(score());
  };
  const hurt = (e: Enemy, dmg: number) => { e.hp -= dmg; e.hit = 0.1; if (e.hp <= 0) { enemies.splice(enemies.indexOf(e), 1); kill(e); } };
  const offer = () => {
    const all: Up[] = ['upRate', 'upDamage', 'upMulti', 'upSpeed', 'upMagnet', 'upBlades', 'upHeal', 'upPierce'];
    const ok = all.filter((u) => !(u === 'upMulti' && stat.multi >= 5) && !(u === 'upBlades' && stat.blades >= 4) && !(u === 'upHeal' && p.hp >= 5) && !(u === 'upRate' && stat.every <= 0.13) && !(u === 'upPierce' && stat.pierce >= 3) && !(u === 'upSpeed' && stat.speed > 330));
    choice = shuffle(r, ok).slice(0, 3);
    sfx.great();
  };
  const take = (i: number) => {
    const u = choice?.[i];
    if (!u) return;
    if (u === 'upRate') stat.every *= 0.8; else if (u === 'upDamage') stat.damage += 1; else if (u === 'upMulti') stat.multi += 1; else if (u === 'upSpeed') stat.speed *= 1.14;
    else if (u === 'upMagnet') stat.magnet *= 1.6; else if (u === 'upBlades') stat.blades += 1; else if (u === 'upPierce') stat.pierce += 1; else p.hp = Math.min(5, p.hp + 1);
    taken[u] = (taken[u] ?? 0) + 1;
    choice = null; grace = 0.6; p.inv = Math.max(p.inv, 0.8);
    sfx.good(); hud();
  };
  const cards = () => {
    const n = choice?.length ?? 0, cw = Math.min(110, (W - 40) / 3 - 8), ch = 120, gap = 8, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y0 = H / 2 - ch / 2 + 10;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch }));
  };

  return {
    step(dt) {
      fx.step(dt);
      if (dead) { dead += dt; if (dead > 1.3 && !ended) { ended = true; api.end(score()); } return; }
      if (choice) return;
      time += dt; grace = Math.max(0, grace - dt); p.inv = Math.max(0, p.inv - dt);
      api.score(score());
      // Steering: keys, the mouse position, or a finger dragged anywhere (the ship moves the same way).
      const mx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), my = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
      if (mx || my) { const n = Math.hypot(mx, my); p.x += (mx / n) * stat.speed * dt; p.y += (my / n) * stat.speed * dt; target = null; }
      else if (target) {
        const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
        if (d > 2) { const s = Math.min(d, stat.speed * dt); p.x += (dx / d) * s; p.y += (dy / d) * s; }
      }
      p.x = clamp(p.x, p.r, W - p.r); p.y = clamp(p.y, p.r, H - p.r);
      // Waves
      spawn -= dt;
      if (spawn <= 0) { spawn = 1 / Math.min(7, 0.9 + time * 0.035); if (grace <= 0) { spawnEnemy(); if (time > 60 && r() < 0.3) spawnEnemy(); } }
      // Fire at the nearest enemy
      let near: Enemy | null = null, nd = 1e9;
      for (const e of enemies) { const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2; if (d < nd) { nd = d; near = e; } }
      if (near) p.aim = Math.atan2(near.y - p.y, near.x - p.x);
      fire -= dt;
      if (fire <= 0 && near && nd < 330 * 330) {
        fire = stat.every;
        for (let i = 0; i < stat.multi && shots.length < MAX_SHOTS; i++) {
          const a = p.aim + (i - (stat.multi - 1) / 2) * 0.16;
          shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 0.9, pierce: stat.pierce, seen: [] });
        }
        sfx.note([88], 'square', 0.015, 0.03);
      }
      for (const s of shots) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        for (const e of enemies) {
          if (s.seen.includes(e) || (e.x - s.x) ** 2 + (e.y - s.y) ** 2 > (e.r + 4) ** 2) continue;
          hurt(e, stat.damage);
          fx.pop(s.x, s.y, '#ffffff', 9);
          if (s.pierce-- <= 0) s.life = 0; else s.seen.push(e);
          break;
        }
      }
      shots = shots.filter((s) => s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
      // Enemies
      for (const e of [...enemies]) {
        e.hit = Math.max(0, e.hit - dt); e.blade = Math.max(0, e.blade - dt);
        if (e.kind === 'dart') {
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (e.x < -60 || e.x > W + 60 || e.y < -60 || e.y > H + 60) { const a = Math.atan2(p.y - e.y, p.x - e.x); e.vx = Math.cos(a) * 170; e.vy = Math.sin(a) * 170; }
        } else {
          const a = Math.atan2(p.y - e.y, p.x - e.x), sp = (e.kind === 'tank' ? 42 : 62) + Math.min(45, time * 0.35);
          e.x += Math.cos(a) * sp * dt; e.y += Math.sin(a) * sp * dt;
        }
        const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
        for (let b = 0; b < stat.blades; b++) {
          const a = time * 3.2 + (b / stat.blades) * TAU, bx = p.x + Math.cos(a) * 44, by = p.y + Math.sin(a) * 44;
          if (e.blade <= 0 && (e.x - bx) ** 2 + (e.y - by) ** 2 < (e.r + 8) ** 2) { e.blade = 0.3; hurt(e, 1 + Math.floor(stat.damage / 2)); break; }
        }
        if (e.hp > 0 && d2 < (e.r + p.r - 2) ** 2 && p.inv <= 0) {
          p.hp--; p.inv = 1.4;
          fx.shake(8, 0.3); fx.blink('#ff6b5e', 0.4); sfx.bad(); buzz(70); hud();
          if (e.kind !== 'tank') { enemies.splice(enemies.indexOf(e), 1); fx.burst(e.x, e.y, '#ff6b5e', 10, 150, 3); }
          if (p.hp <= 0) { dead = 0.0001; fx.confetti(p.x, p.y, ['#ffffff', '#4aa8ff', '#ff9f43'], 40, 300); sfx.boom(); return; }
        }
      }
      // Shards drift to the ship inside the magnet's reach
      shards = shards.filter((s) => {
        const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
        if (d < stat.magnet) s.pull = true;
        if (s.pull) { const v = 420 * dt; s.x += (dx / (d || 1)) * v; s.y += (dy / (d || 1)) * v; }
        if (d > 14) return true;
        xp += s.v; sfx.note([79 + Math.min(12, xp)], 'sine', 0.05, 0.04);
        if (xp >= need()) { xp -= need(); level++; hud(); offer(); }
        return false;
      });
    },
    draw(g, t) {
      const q = theme.get();
      fx.begin(g);
      scene(g, W, H, t, q, false);
      g.fillStyle = q.text;
      for (const s of stars) { g.globalAlpha = 0.12 + s.s * 0.1; g.beginPath(); g.arc((s.x - p.x * 0.05 * s.s + W) % W, (s.y - p.y * 0.05 * s.s + H) % H, s.s, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      for (const s of shards) { g.save(); g.translate(s.x, s.y); g.rotate(t * 3 + s.x); shape(g, q, q.sky, () => rrect(g, -4, -4, 8, 8, 2), 1.5, 0); g.restore(); }
      for (const e of enemies) {
        const c = e.hit > 0 ? q.white : e.kind === 'tank' ? q.orange : e.kind === 'dart' ? q.sun : q.coral;
        g.save(); g.translate(e.x, e.y);
        const a = e.kind === 'dart' ? Math.atan2(e.vy, e.vx) : Math.atan2(p.y - e.y, p.x - e.x);
        g.rotate(a);
        shape(g, q, c, () => {
          g.beginPath();
          if (e.kind === 'tank') for (let i = 0; i < 6; i++) g.lineTo(Math.cos((i / 6) * TAU) * e.r, Math.sin((i / 6) * TAU) * e.r);
          else if (e.kind === 'dart') { g.moveTo(e.r + 6, 0); g.lineTo(-e.r, -5); g.lineTo(-e.r, 5); }
          else g.arc(0, 0, e.r, 0, TAU);
          g.closePath();
        }, 2, 0);
        // A grumpy face looking at the ship
        if (e.kind !== 'dart') {
          const k = e.r / 9;
          g.fillStyle = '#ffffff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(3 * k, s * 3.2 * k, 2.4 * k, 0, TAU); g.fill(); }
          g.fillStyle = q.ink; for (const s of [-1, 1]) { g.beginPath(); g.arc(4 * k, s * 3.2 * k, 1.2 * k, 0, TAU); g.fill(); }
        }
        g.restore();
        if (e.kind === 'tank' && e.hp < e.max) { g.fillStyle = q.ink; g.fillRect(e.x - 13, e.y - e.r - 9, 26, 5); g.fillStyle = q.mint; g.fillRect(e.x - 12, e.y - e.r - 8, 24 * (e.hp / e.max), 3); }
      }
      g.lineCap = 'round';
      for (const s of shots) {
        g.strokeStyle = q.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 0.022, s.y - s.vy * 0.022); g.stroke();
        g.strokeStyle = q.sun; g.lineWidth = 3; g.stroke();
      }
      if (!dead) {
        for (let b = 0; b < stat.blades; b++) { const a = time * 3.2 + (b / stat.blades) * TAU; ball(g, q, p.x + Math.cos(a) * 44, p.y + Math.sin(a) * 44, 7, q.grape, 2, 0); }
        if (p.inv <= 0 || Math.floor(t * 14) % 2) {
          g.save(); g.translate(p.x, p.y); g.rotate(p.aim);
          g.fillStyle = q.orange; g.beginPath(); g.ellipse(-11, 0, 4 + Math.sin(t * 30) * 1.5, 3, 0, 0, TAU); g.fill();
          shape(g, q, q.white, () => { g.beginPath(); g.moveTo(14, 0); g.quadraticCurveTo(2, -11, -9, -9); g.lineTo(-5, 0); g.lineTo(-9, 9); g.quadraticCurveTo(2, 11, 14, 0); g.closePath(); }, 2, 0);
          g.fillStyle = q.sky; g.beginPath(); g.arc(2, 0, 3.6, 0, TAU); g.fill(); g.strokeStyle = q.ink; g.lineWidth = 1.5; g.stroke();
          g.restore();
        }
      }
      // XP bar
      g.fillStyle = q.line; g.fillRect(0, 0, W, 5);
      g.fillStyle = q.sky; g.fillRect(0, 0, W * clamp(xp / need(), 0, 1), 5);
      fx.draw(g, q);
      if (choice) {
        g.globalAlpha = 0.86; g.fillStyle = q.bg0; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
        label(g, q, `${api.t('level', { n: level })} · ${api.t('pick')}`, W / 2, H / 2 - 82, 19, q.sun, W - 24);
        cards().forEach((c, i) => {
          const u = choice![i];
          tile(g, q, c.x, c.y, c.w, c.h, 14, q.paper, 2, 4);
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '34px serif'; g.fillStyle = q.text; g.fillText(UP_ICON[u], c.x + c.w / 2, c.y + 42);
          write(g, q, api.t(u), c.x + c.w / 2, c.y + 82, 12, 800, q.text, c.w - 10);
          write(g, q, api.phone ? '●'.repeat((taken[u] ?? 0) + 1) : `${i + 1}`, c.x + c.w / 2, c.y + 104, 11, 700, q.soft);
        });
      }
      fx.end(g, W, H);
    },
    pointer(e) {
      if (choice) return;
      if (!api.phone) { if (e.type !== 'up') target = { x: e.x, y: e.y }; return; }
      if (e.type === 'down') drag = { fx: e.x, fy: e.y, px: p.x, py: p.y };
      else if (e.type === 'move' && drag) target = { x: clamp(drag.px + (e.x - drag.fx) * 1.35, 0, W), y: clamp(drag.py + (e.y - drag.fy) * 1.35, 0, H) };
      else if (e.type === 'up') { drag = null; target = null; }
    },
    tap(x, y) { if (choice) cards().forEach((c, i) => { if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) take(i); }); },
    key(code, down) {
      if (code === 'ArrowLeft' || code === 'KeyA') keys.l = down; else if (code === 'ArrowRight' || code === 'KeyD') keys.r = down;
      else if (code === 'ArrowUp' || code === 'KeyW') keys.u = down; else if (code === 'ArrowDown' || code === 'KeyS') keys.d = down;
      else if (down && choice && /^(Digit|Numpad)[1-3]$/.test(code)) take(Number(code.slice(-1)) - 1);
    },
  };
}
