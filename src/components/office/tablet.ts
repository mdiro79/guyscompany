'use client';
import * as THREE from 'three';
import { drawIcon, type IconName } from './icons';

// The seat tablet on the conference table: a touch screen with real buttons, pressed right on it in 3D
// (click with the crosshair or the cursor, tap on phones). Only the tablet at one's own seat is live;
// the others show the same screen at rest. What the buttons do is wired up by the office view.

export type TabletButton = 'hand' | 'mic' | 'board' | 'present' | 'react' | 'look' | 'lights' | 'stand';
export const TABLET_BUTTONS: TabletButton[] = ['hand', 'mic', 'board', 'present', 'react', 'look', 'lights', 'stand'];

export interface TabletLabels {
  title: string; idle: string; presenting: string; // "{name}" is replaced
  raiseHand: string; lowerHand: string; micOn: string; micOff: string; board: string; present: string; stopPresent: string; view: string;
  react: string; look: string; lightPresent: string; stand: string; hands: string; rtl: boolean;
}

export interface TabletState {
  hand: boolean; mic: boolean; presenting: 'me' | 'other' | null; presenterName: string; dimmed: boolean; hands: number;
  hover: TabletButton | null; flash: TabletButton | null; labels: TabletLabels | null;
}

let state: TabletState = { hand: false, mic: false, presenting: null, presenterName: '', dimmed: false, hands: 0, hover: null, flash: null, labels: null };
const listeners = new Set<() => void>();
let onPress: ((b: TabletButton) => void) | null = null;

export const tablet = {
  get: () => state,
  set(patch: Partial<TabletState>) {
    if (Object.entries(patch).every(([k, v]) => Object.is(state[k as keyof TabletState], v))) return;
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  /** The office view handles presses. */
  handle(fn: ((b: TabletButton) => void) | null) { onPress = fn; },
  press(b: TabletButton) {
    tablet.set({ flash: b });
    setTimeout(() => { if (state.flash === b) tablet.set({ flash: null }); }, 220);
    onPress?.(b);
  },
};

// ——— Layout and painting (canvas pixels) ———

export const TABLET_PX: [number, number] = [1024, 640];
const HEADER = 96, PAD = 28, GAP = 20, COLS = 4;

/** Where each button sits on the screen; the order follows the reading direction. */
export function buttonRects(rtl: boolean) {
  const [W, H] = TABLET_PX;
  const w = (W - PAD * 2 - GAP * (COLS - 1)) / COLS, h = (H - HEADER - PAD - GAP) / 2;
  return TABLET_BUTTONS.map((id, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const c = rtl ? COLS - 1 - col : col;
    return { id, x: PAD + c * (w + GAP), y: HEADER + row * (h + GAP), w, h };
  });
}

/** The button under a point of the screen (texture coordinates, v going up). */
export function buttonAtUv(u: number, v: number, rtl: boolean): TabletButton | null {
  const x = u * TABLET_PX[0], y = (1 - v) * TABLET_PX[1];
  return buttonRects(rtl).find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
}

const font = (rtl: boolean, weight: number, px: number) => `${weight} ${px}px ${rtl ? '"Vazirmatn Variable", Tahoma' : '"Inter Variable", system-ui'}, sans-serif`;

function look(s: TabletState, id: TabletButton): { icon: IconName; label: string; color: string; on: boolean } {
  const l = s.labels!;
  switch (id) {
    case 'hand': return { icon: 'raiseHand', label: s.hand ? l.lowerHand : l.raiseHand, color: '#5b8def', on: s.hand };
    case 'mic': return { icon: s.mic ? 'mic' : 'micOff', label: s.mic ? l.micOn : l.micOff, color: s.mic ? '#22a559' : '#c2413b', on: true };
    case 'board': return { icon: 'pen', label: l.board, color: '#2f9e6b', on: false };
    case 'present':
      return s.presenting === 'me' ? { icon: 'monitorUp', label: l.stopPresent, color: '#d9443c', on: true }
        : s.presenting === 'other' ? { icon: 'eye', label: l.view, color: '#8b6fd6', on: true }
          : { icon: 'cast', label: l.present, color: '#8b6fd6', on: false };
    case 'react': return { icon: 'smile', label: l.react, color: '#f08a3c', on: false };
    case 'look': return { icon: 'shareScreen', label: l.look, color: '#3fb3ad', on: false };
    case 'lights': return { icon: 'sun', label: l.lightPresent, color: '#e0a526', on: s.dimmed };
    case 'stand': return { icon: 'logOut', label: l.stand, color: '#7d8597', on: false };
  }
}

/** Paints the tablet's screen. `live`: the tablet at one's own seat (hover and pressed states). */
export function paintTablet(c: HTMLCanvasElement, s: TabletState, live: boolean) {
  const [W, H] = TABLET_PX, g = c.getContext('2d')!;
  const l = s.labels;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d2740'); bg.addColorStop(1, '#111827');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (!l) return;
  const rtl = l.rtl;
  g.direction = rtl ? 'rtl' : 'ltr';
  g.textBaseline = 'middle';
  // Header: the room on one side, who is presenting (and raised hands) on the other.
  g.fillStyle = '#ffffff'; g.font = font(rtl, 700, 34);
  g.textAlign = rtl ? 'right' : 'left';
  g.fillText(l.title, rtl ? W - PAD : PAD, HEADER / 2);
  const status = live && s.presenting ? l.presenting.replace('{name}', s.presenterName) : l.idle;
  g.font = font(rtl, 500, 26);
  const sw = Math.min(W * 0.55, g.measureText(status).width + 52);
  const sx = rtl ? PAD : W - PAD - sw;
  g.fillStyle = live && s.presenting ? 'rgba(217,68,60,0.9)' : 'rgba(255,255,255,0.12)';
  g.beginPath(); g.roundRect(sx, HEADER / 2 - 24, sw, 48, 24); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center';
  g.fillText(status, sx + sw / 2, HEADER / 2 + 1, sw - 30);
  if (live && s.hands > 0) {
    const hx = rtl ? sx + sw + 18 : sx - 18 - 92;
    g.fillStyle = '#5b8def'; g.beginPath(); g.roundRect(hx, HEADER / 2 - 24, 92, 48, 24); g.fill();
    drawIcon(g, 'raiseHand', hx + 30, HEADER / 2, 30, '#ffffff', 2.4);
    g.fillStyle = '#ffffff'; g.font = font(false, 700, 28); g.fillText(String(s.hands), hx + 66, HEADER / 2 + 1);
  }
  // Buttons.
  for (const r of buttonRects(rtl)) {
    const b = look(s, r.id);
    const hover = live && s.hover === r.id, flash = live && s.flash === r.id;
    const on = live && b.on;
    g.fillStyle = on ? b.color : hover ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 28); g.fill();
    if (hover || flash) { g.lineWidth = flash ? 10 : 6; g.strokeStyle = flash ? '#ffffff' : 'rgba(255,255,255,0.75)'; g.stroke(); }
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.4;
    g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2);
    g.fillStyle = on ? 'rgba(255,255,255,0.22)' : b.color; g.fill();
    drawIcon(g, b.icon, cx, cy, 64, '#ffffff', 2.2);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = font(rtl, 600, 28);
    g.fillText(b.label, cx, r.y + r.h - 40, r.w - 20);
  }
  g.direction = 'ltr';
}

// ——— Pressing in 3D ———

// The live tablet's screen and the scene's camera and canvas, registered by the scene.
export const tabletHit: { mesh: THREE.Mesh | null; camera: THREE.Camera | null; dom: HTMLCanvasElement | null; pressedAt: number } = { mesh: null, camera: null, dom: null, pressedAt: 0 };
const ray = new THREE.Raycaster();

/** The button at a point of the view (normalised device coordinates; 0,0 = the crosshair). */
export function buttonAt(ndc: { x: number; y: number }): TabletButton | null {
  const { mesh, camera } = tabletHit;
  if (!mesh || !camera || !state.labels) return null;
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const uv = ray.intersectObject(mesh, false)[0]?.uv;
  return uv ? buttonAtUv(uv.x, uv.y, state.labels.rtl) : null;
}

/** Normalised device coordinates of a screen point over the 3D view, or null outside it. */
export function toNdc(clientX: number, clientY: number) {
  const r = tabletHit.dom?.getBoundingClientRect();
  if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  return { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 };
}

/** A click or tap on the view: presses the tablet button there. True when one was pressed. */
export function pressAt(ndc: { x: number; y: number } | null) {
  const b = ndc && buttonAt(ndc);
  if (!b) return false;
  tabletHit.pressedAt = performance.now();
  tablet.press(b);
  return true;
}
