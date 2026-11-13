'use client';
import { CanvasStage } from '../kit/Stage';
import type { Game2D, GameApi } from '../kit/types';
import { Fx, TAU, ball, scene, shape, star } from '../kit/fx';
import { theme, type Palette } from '../kit/theme';
import { clamp, rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Orbit Hop. A little comet circles a planet; one tap sends it off in the direction it is heading. If it
// flies into the pull of another planet it starts circling that one: a point for every new planet (more
// for skipping one), three for a star picked up on the way. A planet's energy ring runs down while the
// comet stays, so there is no waiting forever; drifting off into space ends the round.

const W = 360, H = 600;
interface Planet { x: number; y: number; r: number; hue: number; spin: 1 | -1; face: number }
interface Star { x: number; y: number; got: boolean }

export default function Orbit({ api }: { api: GameApi }) {
  return <CanvasStage api={api} size={[W, H]} init={() => create(api)} />;
}

function create(api: GameApi): Game2D {
  const r = rng(api.seed), fx = new Fx();
  const planets: Planet[] = [{ x: W / 2, y: 0, r: 26, hue: 0, spin: 1, face: 0 }];
  const stars: Star[] = [];
  const trail: [number, number][] = [];
  let on = 0, best = 0, ang = Math.PI / 2, dir: 1 | -1 = 1, flying = false, x = 0, y = 0, vx = 0, vy = 0, flight = 0, leftFrom = -1;
  let stay = 0, launched = false, score = 0, cam = 0, dead = 0, ended = false;
  const reach = (p: Planet) => p.r + 24;
  const speed = () => 2.5 + Math.min(1.6, best * 0.04);
  const patience = () => Math.max(3.4, 6.5 - best * 0.08);
  const grow = () => {
    while (planets.length < on + 8) {
      const last = planets[planets.length - 1], i = planets.length;
      let px = 0;
      do { px = 55 + r() * (W - 110); } while (Math.abs(px - last.x) < 70);
      const p: Planet = { x: px, y: last.y - (120 + r() * 45 + Math.min(40, i * 1.5)), r: Math.max(15, 26 - i * 0.25) + r() * 4, hue: Math.floor(r() * 6), spin: r() < 0.5 ? 1 : -1, face: Math.floor(r() * 3) };
      planets.push(p);
      if (r() < 0.7) stars.push({ x: (last.x + p.x) / 2 + (r() - 0.5) * 70, y: (last.y + p.y) / 2 + (r() - 0.5) * 30, got: false });
    }
  };
  grow();
  const place = () => { const p = planets[on]; x = p.x + Math.cos(ang) * reach(p); y = p.y + Math.sin(ang) * reach(p); };
  place();
  cam = planets[0].y - H * 0.68;

  const launch = () => {
    if (flying || dead) return;
    const p = planets[on], v = speed() * reach(p) * 1.25;
    vx = -Math.sin(ang) * dir * v; vy = Math.cos(ang) * dir * v;
    flying = true; flight = 0; leftFrom = on; launched = true;
    sfx.move(); buzz(8);
  };
  const die = () => {
    dead = 0.0001;
    const p = theme.get();
    fx.confetti(x, y - cam, [p.white, p.sun, p.sky], 26, 240); fx.shake(7, 0.35);
    sfx.boom(); buzz(70);
  };

  return {
    step(dt) {
      fx.step(dt);
      if (dead) { dead += dt; if (dead > 1.1 && !ended) { ended = true; api.end(score); } return; }
      if (!flying) {
        const p = planets[on];
        ang += speed() * dir * dt;
        place();
        if (launched) { stay += dt; if (stay > patience()) { fx.pop(p.x, p.y - cam, '#ffffff', p.r * 2.5); die(); return; } }
      } else {
        flight += dt;
        x += vx * dt; y += vy * dt;
        for (const s of stars) if (!s.got && (s.x - x) ** 2 + (s.y - y) ** 2 < 18 * 18) {
          s.got = true; score += 3; api.score(score);
          fx.text(s.x, s.y - cam - 10, '+3', '#ffc93c', 18); fx.pop(s.x, s.y - cam, '#ffc93c', 20); sfx.good();
        }
        for (let i = Math.max(0, on - 2); i < planets.length; i++) {
          const p = planets[i], dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
          if (i === leftFrom && flight < 0.25) continue;
          if (d > reach(p) + 4) continue;
          // Caught: keep circling the way the comet was passing.
          on = i; flying = false; stay = 0; ang = Math.atan2(dy, dx);
          dir = dx * vy - dy * vx >= 0 ? 1 : -1;
          if (i > best) { const gain = i - best; best = i; score += gain + (gain > 1 ? gain - 1 : 0); api.score(score); fx.text(p.x, p.y - cam - p.r - 16, `+${gain + (gain > 1 ? gain - 1 : 0)}`, '#ffffff', gain > 1 ? 24 : 18); sfx.point(best % 12); }
          else sfx.tick();
          fx.pop(p.x, p.y - cam, '#ffffff', reach(p) + 6); buzz(10);
          grow();
          break;
        }
        if (flying && (flight > 2.4 || x < -40 || x > W + 40 || y - cam > H + 40 || y - cam < -160)) { die(); return; }
      }
      trail.push([x, y]); if (trail.length > 16) trail.shift();
      // The camera glides up with the planet the comet is on.
      cam += (planets[on].y - H * 0.68 - cam) * Math.min(1, dt * 3.5);
    },
    draw(g, t) {
      const p = theme.get();
      fx.begin(g);
      scene(g, W, H, t, p, false);
      // Far stars drifting by slower than the planets.
      g.fillStyle = p.text;
      for (let i = 0; i < 26; i++) { const sx = (i * 97) % W, sy = (((i * 61 - cam * 0.25) % H) + H) % H; g.globalAlpha = 0.14 + (i % 3) * 0.06; g.beginPath(); g.arc(sx, sy, 1 + (i % 3) * 0.5, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      for (const s of stars) if (!s.got && s.y - cam > -30 && s.y - cam < H + 30) shape(g, p, p.sun, () => star(g, s.x, s.y - cam, 9 + Math.sin(t * 5 + s.x) * 1, t), 2, 2);
      planets.forEach((pl, i) => {
        const py = pl.y - cam;
        if (py < -80 || py > H + 80) return;
        // Pull zone
        g.strokeStyle = p.line; g.lineWidth = 2; g.setLineDash([4, 6]); g.beginPath(); g.arc(pl.x, py, reach(pl), 0, TAU); g.stroke(); g.setLineDash([]);
        if (i === on && !flying && launched && !dead) {
          const k = clamp(1 - stay / patience(), 0, 1);
          g.strokeStyle = k < 0.3 ? p.coral : p.mint; g.lineWidth = 4; g.lineCap = 'round';
          g.beginPath(); g.arc(pl.x, py, reach(pl), -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
        }
        planet(g, p, pl, py, t);
      });
      // Where a tap would send the comet right now.
      if (!flying && !dead) {
        const tx = -Math.sin(ang) * dir, ty = Math.cos(ang) * dir;
        g.fillStyle = p.text;
        for (let i = 1; i <= 9; i++) { g.globalAlpha = 0.38 - i * 0.035; g.beginPath(); g.arc(x + tx * i * 17, y - cam + ty * i * 17, 2.2, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      }
      // Comet and its tail
      if (!dead) {
        trail.forEach(([tx, ty], i) => { g.globalAlpha = (i / trail.length) * 0.5; g.fillStyle = p.sun; g.beginPath(); g.arc(tx, ty - cam, 2 + (i / trail.length) * 4, 0, TAU); g.fill(); });
        g.globalAlpha = 1;
        ball(g, p, x, y - cam, 7.5, p.white, 2, 2);
      }
      fx.draw(g, p);
      fx.end(g, W, H);
    },
    tap() { launch(); },
    key(code, down) { if (down && (code === 'Space' || code === 'ArrowUp' || code === 'Enter')) launch(); },
  };
}

function planet(g: CanvasRenderingContext2D, p: Palette, pl: Planet, py: number, t: number) {
  const colors = [p.coral, p.sky, p.mint, p.grape, p.pink, p.orange];
  ball(g, p, pl.x, py, pl.r, colors[pl.hue], 2.5, 4);
  // A band, a ring or spots, and a sleepy face.
  g.save(); g.beginPath(); g.arc(pl.x, py, pl.r - 1.5, 0, TAU); g.clip();
  g.fillStyle = 'rgba(0,0,0,0.12)';
  if (pl.face === 0) g.fillRect(pl.x - pl.r, py + pl.r * 0.15, pl.r * 2, pl.r * 0.3);
  else if (pl.face === 1) { g.beginPath(); g.arc(pl.x + pl.r * 0.4, py + pl.r * 0.45, pl.r * 0.3, 0, TAU); g.arc(pl.x - pl.r * 0.5, py - pl.r * 0.1, pl.r * 0.18, 0, TAU); g.fill(); }
  else { g.beginPath(); g.arc(pl.x + pl.r * 0.9, py + pl.r * 0.9, pl.r * 1.1, 0, TAU); g.fill(); }
  g.restore();
  const blink = Math.sin(t * 1.3 + pl.x) > 0.96;
  g.fillStyle = p.ink;
  for (const s of [-1, 1]) { g.beginPath(); if (blink) g.rect(pl.x + s * pl.r * 0.32 - 2.5, py - pl.r * 0.12, 5, 1.6); else g.arc(pl.x + s * pl.r * 0.32, py - pl.r * 0.12, Math.max(1.6, pl.r * 0.09), 0, TAU); g.fill(); }
  g.strokeStyle = p.ink; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.arc(pl.x, py + pl.r * 0.08, pl.r * 0.2, 0.2, Math.PI - 0.2); g.stroke();
}
