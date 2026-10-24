'use client';
import * as THREE from 'three';
import { drawIcon, type IconName } from './icons';

// Textures painted on canvases at runtime (no image downloads). Each is made once and shared.

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
};

const texture = (c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

const once = <T,>(make: () => T) => { let v: T | undefined; return () => (v ??= make()); };

// Deterministic noise so textures look the same on every load.
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// Light oak for the round table: four quarters with the grain turned a quarter each, seams between them.
export const tableWood = once(() => {
  const S = 1024, [c, g] = canvas(S, S), r = rng(7);
  g.fillStyle = '#e8cda4'; g.fillRect(0, 0, S, S);
  for (let q = 0; q < 4; q++) {
    g.save();
    g.beginPath(); g.moveTo(S / 2, S / 2); g.arc(S / 2, S / 2, S, q * Math.PI / 2 - Math.PI / 4, q * Math.PI / 2 + Math.PI / 4); g.closePath(); g.clip();
    g.translate(S / 2, S / 2); g.rotate(q * Math.PI / 2); g.translate(-S / 2, -S / 2);
    for (let i = 0; i < 260; i++) {
      const y = r() * S, a = 0.03 + r() * 0.06, w = 1 + r() * 3;
      g.strokeStyle = r() > 0.5 ? `rgba(150,105,60,${a})` : `rgba(255,240,215,${a * 1.4})`;
      g.lineWidth = w;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= S; x += 64) g.lineTo(x, y + Math.sin(x / 140 + i) * 4);
      g.stroke();
    }
    g.restore();
  }
  g.strokeStyle = 'rgba(120,85,50,0.35)'; g.lineWidth = 2.5;
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2 + Math.PI / 4;
    g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S, S / 2 + Math.sin(a) * S); g.stroke();
  }
  return texture(c);
});

// Plain oak with straight grain (cabinet, pedestal).
export const oak = once(() => {
  const [c, g] = canvas(512, 512), r = rng(3);
  g.fillStyle = '#d9b98c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const x = r() * 512;
    g.strokeStyle = `rgba(140,95,55,${0.04 + r() * 0.07})`; g.lineWidth = 1 + r() * 2.5;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, 170, x - 6, 340, x + 3, 512); g.stroke();
  }
  return texture(c, { repeat: [1, 1] });
});

// Cabinet front: vertical oak slats with dark gaps.
export const slats = once(() => {
  const [c, g] = canvas(1024, 256), r = rng(11);
  g.fillStyle = '#3b2a1c'; g.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 16) {
    const l = 200 + r() * 20;
    g.fillStyle = `rgb(${l},${l * 0.8},${l * 0.58})`;
    g.fillRect(x + 2, 0, 12, 256);
  }
  return texture(c);
});

// Rose carpet with a soft weave.
export const carpet = once(() => {
  const [c, g] = canvas(256, 256), r = rng(5);
  g.fillStyle = '#e19a93'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,225,220,0.12)' : 'rgba(170,90,90,0.1)';
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  return texture(c, { repeat: [6, 6] });
});

// Cream wall panel with a warm wash of light from the top, like a wall washer above each panel.
export const panelWash = once(() => {
  const [c, g] = canvas(256, 512);
  const base = g.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#fbf3e6'); base.addColorStop(0.55, '#f1e5d3'); base.addColorStop(1, '#e2d2bc');
  g.fillStyle = base; g.fillRect(0, 0, 256, 512);
  const wash = g.createRadialGradient(128, -40, 10, 128, -40, 330);
  wash.addColorStop(0, 'rgba(255,236,200,0.95)'); wash.addColorStop(0.45, 'rgba(255,230,190,0.35)'); wash.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = wash; g.fillRect(0, 0, 256, 512);
  return texture(c);
});

// Walls elsewhere: slightly lighter towards the ceiling, a touch darker at the skirting.
export const wallWash = once(() => {
  const [c, g] = canvas(4, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.6, '#f3f0ea'); grad.addColorStop(1, '#d9d2c8');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return texture(c);
});

// Soft round contact shadow (alpha only) used under furniture and people.
export const softShadow = once(() => {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.45, 'rgba(0,0,0,0.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return texture(c, { srgb: false });
});

// Warm halo on the carpet around the table's pedestal.
export const floorGlow = once(() => {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,220,170,0)'); grad.addColorStop(0.62, 'rgba(255,214,160,0.85)'); grad.addColorStop(0.7, 'rgba(255,240,215,1)');
  grad.addColorStop(0.78, 'rgba(255,214,160,0.5)'); grad.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return texture(c);
});

export interface MeetingLabels { title: string; subtitle: string; raiseHand: string; shareIdea: string; shareImage: string; shareScreen: string; more: string; rtl: boolean }
const BUTTONS: (keyof MeetingLabels & IconName)[] = ['raiseHand', 'shareIdea', 'shareImage', 'shareScreen', 'more'];
const font = (rtl: boolean, weight: number, px: number) => `${weight} ${px}px ${rtl ? '"Vazirmatn Variable", Tahoma' : '"Inter Variable", system-ui'}, sans-serif`;

// Large conference screen: dusk mountains, "Team Meeting" and the five round meeting buttons.
export function paintScreen(c: HTMLCanvasElement, l: MeetingLabels) {
  const W = c.width, H = c.height, g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#a9c7ea'); sky.addColorStop(0.55, '#b4b4e4'); sky.addColorStop(1, '#8f9bd6');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.55, H * 0.55, 10, W * 0.55, H * 0.55, W * 0.45);
  glow.addColorStop(0, 'rgba(255,200,230,0.45)'); glow.addColorStop(1, 'rgba(255,200,230,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    const r = rng(seed);
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    let y = base;
    for (let x = 0; x <= W; x += W / 24) { y = base - amp * (0.3 + r() * 0.7) * Math.sin((x / W) * Math.PI * (1.2 + seed * 0.1) + seed); g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.62, H * 0.22, 'rgba(150,150,215,0.55)', 2);
  ridge(H * 0.72, H * 0.18, 'rgba(125,128,205,0.6)', 5);
  ridge(H * 0.84, H * 0.14, 'rgba(110,112,190,0.65)', 9);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.direction = l.rtl ? 'rtl' : 'ltr';
  g.fillStyle = '#ffffff'; g.shadowColor = 'rgba(40,40,90,0.25)'; g.shadowBlur = 12;
  g.font = font(l.rtl, 650, H * 0.1); g.fillText(l.title, W / 2, H * 0.33);
  g.font = font(l.rtl, 400, H * 0.048); g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillText(l.subtitle, W / 2, H * 0.42);
  g.shadowBlur = 0;
  const order = l.rtl ? [...BUTTONS].reverse() : BUTTONS;
  const gap = W * 0.13, r = H * 0.078, cy = H * 0.62;
  order.forEach((k, i) => {
    const cx = W / 2 + (i - 2) * gap;
    const active = k === 'raiseHand';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = active ? '#6fa6f3' : 'rgba(255,255,255,0.22)'; g.fill();
    if (active) { g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke(); }
    drawIcon(g, k, cx, cy, r * 1.05, '#ffffff', 1.8);
    g.font = font(l.rtl, 500, H * 0.036); g.fillStyle = '#ffffff';
    g.fillText(l[k] as string, cx, cy + r + H * 0.055);
  });
}

// Seat tablet (the meeting "Steam Deck"): four round actions and a row of small toggles.
export const tabletScreen = once(() => {
  const [c, g] = canvas(512, 320);
  const bg = g.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, '#1d2740'); bg.addColorStop(1, '#121a2e');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 320);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(24, 22, 60, 6); g.fillRect(430, 22, 58, 6);
  const big: [IconName, string][] = [['raiseHand', '#5b8def'], ['mic', '#8b6fd6'], ['shareScreen', '#7d8597'], ['smile', '#f08a3c']];
  big.forEach(([icon, color], i) => {
    const cx = 92 + i * 110, cy = 128;
    g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    drawIcon(g, icon, cx, cy, 42, '#ffffff', 2.2);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(cx - 26, cy + 54, 52, 6);
  });
  const small = ['#3ecf6e', '#e5484d', '#e5484d', '#3ecf6e'];
  small.forEach((color, i) => {
    const cx = 150 + i * 70, cy = 262;
    g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  });
  g.fillStyle = '#3ecf6e'; g.beginPath(); g.roundRect(40, 250, 64, 24, 12); g.fill();
  return texture(c);
});

// Screen of the conference room's wall panel: light (bulb in the current colour, level and bar) and glass.
export function paintRoomPanel(c: HTMLCanvasElement, s: { light: number; warmth: number; frost: number }) {
  const W = c.width, H = c.height, g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d2740'); bg.addColorStop(1, '#111827');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const warm = s.warmth / 100;
  const tint = `rgb(${Math.round(234 + 21 * warm)},${Math.round(241 - 50 * warm)},${Math.round(255 - 140 * warm)})`;
  const bar = (y: number, v: number, color: string) => {
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.roundRect(28, y, W - 56, 14, 7); g.fill();
    if (v > 0) { g.fillStyle = color; g.beginPath(); g.roundRect(28, y, Math.max(14, (W - 56) * v / 100), 14, 7); g.fill(); }
  };
  g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.font = '600 46px "Inter Variable", system-ui, sans-serif';
  // light
  g.save(); g.globalAlpha = 0.25 + 0.75 * (s.light / 100);
  g.beginPath(); g.arc(W / 2, 74, 40, 0, Math.PI * 2); g.fillStyle = tint; g.globalAlpha *= 0.25; g.fill(); g.restore();
  drawIcon(g, 'shareIdea', W / 2, 74, 54, s.light ? tint : 'rgba(255,255,255,0.45)', 2.2);
  g.fillStyle = '#ffffff'; g.fillText(`${s.light}%`, W / 2, 168);
  bar(186, s.light, tint);
  // glass
  drawIcon(g, 'blinds', W / 2, 262, 44, 'rgba(255,255,255,0.85)', 2);
  g.font = '600 36px "Inter Variable", system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillText(`${s.frost}%`, W / 2, 330);
  bar(346, s.frost, '#bfe9e1');
}
