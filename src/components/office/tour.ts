'use client';
import { useSyncExternalStore } from 'react';
import type { Office } from '@/lib/data/types';
import { H, OUT, CONF_RADIUS, RECEPTION_Z, RECEPTIONIST_SEAT, OFFICES, officeSeats, type Vec2 } from './layout';

// Guided tour by the receptionist: she gets up, walks to each part of the office and explains it
// while the player's camera follows her. Paths run along clear corridor lines (checked in tests).

export type Vec3 = [number, number, number];
export interface TourStep {
  key: 'welcome' | 'lines' | 'conference' | 'office' | 'desk' | 'lounge' | 'end';
  guide: Vec2[]; // where the receptionist walks (from her current position)
  player: Vec2[]; // where the player walks (from the current position); empty = stay
  look: Vec3 | 'guide'; // what the player looks at once arrived
  openDoor?: string;
}

export const GUIDE_SPEED = 1.35;
export const PLAYER_DELAY = 0.6; // seconds the player waits before following

const SEAT = RECEPTIONIST_SEAT.pos;

export function tourSteps(slot: number, ownOffice: boolean): TourStep[] {
  const o = OFFICES.find((x) => x.slot === slot) ?? OFFICES[0];
  const side = o.slot % 2 === 1 ? -1 : 1;
  const north = o.slot <= 2;
  const z = (v: number) => (north ? -v : v); // mirrors north/south offices
  const cx = (o.min[0] + o.max[0]) / 2;
  const seat = officeSeats().find((s) => s.slot === o.slot)!;
  const [mx, my, mz] = seat.monitor!.pos;
  const R = CONF_RADIUS, Z = RECEPTION_Z;
  const guideAtOffice: Vec2 = [side * (H + 2.8), z(H - 1.5)];
  const playerAtOffice: Vec2 = [side * (H + 3.6), z(H - 3.4)];
  const office: TourStep = {
    key: 'office',
    guide: [[0.35, R - 1.1], [0.35, R + 0.9], [side * 5, 5.6], ...(north ? [[side * 5.9, 0] as Vec2] : []), guideAtOffice],
    player: [[-0.1, R + 1.0], [side * 4.6, 6.2], ...(north ? [[side * 6.3, 0.5] as Vec2] : []), playerAtOffice],
    look: [cx, 1.1, z(H + 2.5)],
  };
  const inside = ownOffice;
  const desk: TourStep = inside
    ? {
      key: 'desk', openDoor: `o${o.slot}`,
      guide: [[cx + 0.2, z(H - 1.2)], [cx + 0.2, z(H + 1.0)], [cx + 1.3, z(H + 2.6)]],
      player: [[cx + 0.15, z(H - 1.0)], [cx + 0.15, z(H + 3.4)]],
      look: [mx, my - 0.1, mz],
    }
    : { key: 'desk', guide: [], player: [], look: [mx, my - 0.1, mz] };
  const loungeGuide: Vec2 = [side * (OUT - 2.7), -1.5];
  const lounge: TourStep = {
    key: 'lounge',
    guide: inside ? [[cx + 0.2, z(H + 1.0)], [cx + 0.2, z(H - 1.4)], loungeGuide] : [loungeGuide],
    player: inside ? [[cx + 0.15, z(H - 1.4)], [side * (OUT - 4.2), 0.4]] : [[side * (OUT - 4.2), 0.4]],
    look: [side * (OUT - 0.6), 0.6, 0],
  };
  return [
    { key: 'welcome', guide: [[1.3, SEAT[1]], [1.3, Z + 0.9], [0.55, Z + 1.15]], player: [[-0.45, Z + 2.5]], look: 'guide' },
    { key: 'lines', guide: [[1.4, Z + 0.9], [1.4, Z - 1.5], [0.9, H + 1.3]], player: [[-1.45, Z + 0.9], [-1.45, Z - 1.5], [-0.7, H + 1.6]], look: [0.25, 0, H - 1] },
    { key: 'conference', openDoor: 'conf', guide: [[0.35, R + 0.8], [0.35, R - 1.1], [1.0, R - 1.5]], player: [[-0.1, R + 0.9], [-0.1, R - 1.0]], look: [0, 0.8, 0] },
    office, desk, lounge,
    { key: 'end', guide: [[side * 6.2, 0], [side * 5, 5.6], [side * 1.6, H + 1.2], [1.4, Z - 1.4], [1.3, SEAT[1]], SEAT], player: [], look: 'guide' },
  ];
}

// --- path helpers -----------------------------------------------------------
export const pathLength = (p: Vec2[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);

export function pointAt(p: Vec2[], s: number): { pos: Vec2; dir: Vec2; done: boolean } {
  let left = Math.max(0, s);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    if (left <= len) return { pos: [a[0] + dir[0] * left, a[1] + dir[1] * left], dir, done: false };
    left -= len;
  }
  const last = p[p.length - 1];
  const prev = p.length > 1 ? p[p.length - 2] : last;
  const len = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
  return { pos: [...last], dir: [(last[0] - prev[0]) / len, (last[1] - prev[1]) / len], done: true };
}

// --- live state -------------------------------------------------------------
// Positions shared between the receptionist, the player controller and the tour panel (no re-render).
// yaw here is the model's rotation (0 faces +Z, towards the entrance).
export const guide = { pos: [...SEAT] as Vec2, yaw: 0, seated: true, moving: false };
export const me = { pos: [0, 0] as Vec2 };

interface TourState { step: number | null; steps: TourStep[]; startedAt: number; guidePath: Vec2[]; playerPath: Vec2[] }
let state: TourState = { step: null, steps: [], startedAt: 0, guidePath: [], playerPath: [] };
let returnPath: { path: Vec2[]; startedAt: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function begin(step: number) {
  const s = state.steps[step];
  state = {
    ...state, step, startedAt: performance.now(),
    guidePath: [[...guide.pos] as Vec2, ...s.guide],
    playerPath: [[...me.pos] as Vec2, ...s.player],
  };
  emit();
}

export const tour = {
  get: () => state,
  returning: () => returnPath,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  start(steps: TourStep[]) { returnPath = null; state = { ...state, steps }; guide.seated = false; begin(0); },
  next() {
    if (state.step === null) return;
    if (state.step < state.steps.length - 1) begin(state.step + 1);
    else tour.stop();
  },
  // Ends the tour; the receptionist finishes her walk back to the desk (or goes straight back when skipped).
  stop() {
    if (state.step === null) return;
    const last = state.step === state.steps.length - 1;
    returnPath = last ? { path: state.guidePath, startedAt: state.startedAt } : null;
    if (!last) { guide.pos = [...SEAT]; guide.yaw = 0; guide.seated = true; guide.moving = false; }
    state = { ...state, step: null };
    emit();
  },
  doneReturning() { returnPath = null; },
};

// True once both the receptionist and the player reached the end of the current step.
export function stepArrived(now = performance.now()) {
  if (state.step === null) return true;
  const t = (now - state.startedAt) / 1000;
  return t * GUIDE_SPEED >= pathLength(state.guidePath) && (t - PLAYER_DELAY) * GUIDE_SPEED >= pathLength(state.playerPath);
}

export function useTourStep() {
  return useSyncExternalStore(tour.subscribe, () => state.step, () => null);
}

// Starts the tour for this viewer: it visits their own office (or office 1 when they have none).
export function startTourFor(offices: Office[], viewerId: string) {
  const mine = offices.find((o) => o.ownerId === viewerId);
  tour.start(tourSteps(mine?.slot ?? 1, !!mine));
}
