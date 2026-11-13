import { clamp } from './rng';
import type { Palette } from './theme';

// Drawing helpers shared by the 2D games, in the arcade's "Toybox" look: shapes with an ink outline and a
// crisp drop shadow, confetti, pops and bouncy score texts. Everything is pooled in plain arrays.

export type G = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const FONT = (px: number, weight = 800) => `${weight} ${px}px "Inter Variable", "Vazirmatn Variable", system-ui, sans-serif`;
export const hsl = (h: number, s = 80, l = 60, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; g: number; rot: number; spin: number; square: boolean }
interface Floater { x: number; y: number; text: string; color: string; life: number; size: number }
interface Pop { x: number; y: number; r: number; color: string; life: number }

export class Fx {
  private parts: Particle[] = [];
  private floats: Floater[] = [];
  private pops: Pop[] = [];
  private shakeT = 0; private shakeAmp = 0;
  private flash = 0; private flashColor = '#ffffff';

  /** Round crumbs flying apart. */
  burst(x: number, y: number, color: string, n = 12, speed = 160, size = 3.5, life = 0.55, gravity = 0) {
    if (this.parts.length > 380) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.8), color, g: gravity, rot: 0, spin: 0, square: false });
    }
  }
  /** Paper confetti that tumbles down. */
  confetti(x: number, y: number, colors: string[], n = 18, speed = 220) {
    if (this.parts.length > 380) n = Math.min(n, 4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.9 + Math.random() * 0.5, max: 1.4, size: 4 + Math.random() * 3, color: colors[i % colors.length], g: 420, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 14, square: true });
    }
  }
  /** A ring that pops open (a hit, a pickup). */
  pop(x: number, y: number, color: string, r = 22) { if (this.pops.length < 40) this.pops.push({ x, y, r, color, life: 1 }); }
  text(x: number, y: number, text: string, color = '#ffffff', size = 18) { if (this.floats.length < 30) this.floats.push({ x, y, text, color, life: 1, size }); }
  shake(amp = 6, t = 0.25) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = Math.max(this.shakeT, t); }
  blink(color = '#ffffff', strength = 0.5) { this.flash = strength; this.flashColor = color; }

  step(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      const k = Math.exp(-2 * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.life -= dt * 1.1; f.y -= 30 * dt; if (f.life <= 0) this.floats.splice(i, 1); }
    for (let i = this.pops.length - 1; i >= 0; i--) { this.pops[i].life -= dt * 3; if (this.pops[i].life <= 0) this.pops.splice(i, 1); }
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (!this.shakeT) this.shakeAmp = 0;
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }
  /** Call before drawing the world; `end` closes it. */
  begin(g: G) {
    g.save();
    if (this.shakeT > 0) g.translate((Math.random() - 0.5) * this.shakeAmp * 2, (Math.random() - 0.5) * this.shakeAmp * 2);
  }
  draw(g: G, p: Palette) {
    if (p.neon) g.globalCompositeOperation = 'lighter';
    for (const o of this.pops) {
      const k = 1 - o.life;
      g.globalAlpha = o.life; g.strokeStyle = o.color; g.lineWidth = 4 * o.life + 1;
      g.beginPath(); g.arc(o.x, o.y, o.r * (0.4 + k * 0.9), 0, TAU); g.stroke();
    }
    for (const q of this.parts) {
      g.globalAlpha = clamp(q.life / (q.max * 0.5), 0, 1);
      g.fillStyle = q.color;
      if (q.square) { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillRect(-q.size / 2, -q.size / 3, q.size, q.size * 0.66); g.restore(); }
      else { g.beginPath(); g.arc(q.x, q.y, q.size, 0, TAU); g.fill(); }
    }
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const f of this.floats) {
      // Pops in a little larger, then floats up and fades.
      const s = f.size * (1 + Math.max(0, f.life - 0.8) * 1.5);
      g.globalAlpha = clamp(f.life * 2, 0, 1);
      g.font = FONT(s);
      g.strokeStyle = p.ink; g.lineWidth = Math.max(3, s * 0.22); g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }
  end(g: G, w: number, h: number) {
    g.restore();
    if (this.flash > 0) { g.globalAlpha = Math.min(0.55, this.flash); g.fillStyle = this.flashColor; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
  }
}

/** The paper background: a soft gradient, big blobs drifting slowly and a faint pattern of dots. */
export function scene(g: G, w: number, h: number, t: number, p: Palette, dots = true) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, p.bg0); bg.addColorStop(1, p.bg1);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (p.neon) {
    // Neon: a faint grid drifting over the dark.
    g.strokeStyle = p.line; g.lineWidth = 1;
    const s = 32, off = (t * 8) % s;
    g.beginPath();
    for (let x = -s + off; x < w + s; x += s) { g.moveTo(x, 0); g.lineTo(x, h); }
    for (let y = -s + off; y < h + s; y += s) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    return;
  }
  const m = Math.max(w, h);
  p.blobs.forEach((c, i) => {
    const a = t * (0.05 + i * 0.013) + i * 1.9;
    g.globalAlpha = p.dark ? 0.55 : 0.6; g.fillStyle = c;
    g.beginPath(); g.arc(w * (0.5 + Math.cos(a) * 0.42), h * (0.5 + Math.sin(a * 1.3) * 0.42), m * (0.2 + (i % 2) * 0.07), 0, TAU); g.fill();
  });
  g.globalAlpha = 1;
  if (!dots) return;
  g.fillStyle = p.line;
  for (let y = 12; y < h; y += 24) for (let x = 12 + ((y / 24) % 2) * 12; x < w; x += 24) g.fillRect(x, y, 2, 2);
}

export function rrect(g: G, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }

/** Fills the shape made by `path` with a drop shadow underneath and an ink outline around it. */
export function shape(g: G, p: Palette, color: string, path: () => void, outline = 2, drop = 3) {
  if (p.neon) {
    // Neon: the shape glows in its own colour and has a thin bright rim.
    g.save(); g.shadowColor = color; g.shadowBlur = 10; g.fillStyle = color; path(); g.fill(); g.restore();
    if (outline) { g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; path(); g.stroke(); }
    return;
  }
  if (drop) { g.save(); g.translate(0, drop); g.fillStyle = p.shadow; path(); g.fill(); g.restore(); }
  g.fillStyle = color; path(); g.fill();
  if (outline) { g.strokeStyle = p.ink; g.lineWidth = outline; g.lineJoin = 'round'; path(); g.stroke(); }
}
/** A ball with outline, shadow and a small shine. */
export function ball(g: G, p: Palette, x: number, y: number, r: number, color: string, outline = 2, drop = 3) {
  shape(g, p, color, () => { g.beginPath(); g.arc(x, y, r, 0, TAU); }, outline, drop);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.38, r * 0.3, r * 0.18, -0.6, 0, TAU); g.fill();
}
/** A rounded block with outline, shadow and a light band on top. */
export function tile(g: G, p: Palette, x: number, y: number, w: number, h: number, r: number, color: string, outline = 2, drop = 3) {
  shape(g, p, color, () => rrect(g, x, y, w, h, r), outline, drop);
  if (h > 9 && w > 9) { g.fillStyle = 'rgba(255,255,255,0.3)'; rrect(g, x + 3, y + 3, w - 6, Math.min(5, h * 0.28), 3); g.fill(); }
}
/** Text with an ink outline, readable on anything. */
export function label(g: G, p: Palette, text: string, x: number, y: number, px: number, color = '#ffffff', maxWidth?: number) {
  g.font = FONT(px); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (p.neon) { g.save(); g.shadowColor = color; g.shadowBlur = px * 0.6; g.fillStyle = color; g.fillText(text, x, y, maxWidth); g.restore(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(text, x, y, maxWidth); return; }
  g.strokeStyle = p.ink; g.lineWidth = Math.max(3, px * 0.2);
  g.strokeText(text, x, y, maxWidth); g.fillStyle = color; g.fillText(text, x, y, maxWidth);
}
/** Plain text in the theme's text colour. */
export function write(g: G, p: Palette, text: string, x: number, y: number, px: number, weight = 700, color?: string, maxWidth?: number) {
  g.font = FONT(px, weight); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color ?? p.text; g.fillText(text, x, y, maxWidth);
}
/** A five-pointed star path. */
export function star(g: G, x: number, y: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + (i / 10) * TAU, k = i % 2 ? r * 0.46 : r; g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  g.closePath();
}
/** A soft coloured halo, for the few things that should really shine (fire, power orbs). */
export function halo(g: G, x: number, y: number, r: number, color: string, alpha = 0.5) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = alpha; g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
}
/** 0→1 with a little overshoot: things that appear "pop" into place. */
export const spring = (t: number) => { const k = clamp(t, 0, 1); return 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2; };
