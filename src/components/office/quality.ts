// Adaptive graphics quality of the 3D office. Quality moves one small step at a time along a ladder
// (sharpness first, then ambient occlusion, then glow, then frame rate), never jumping straight from
// best to lowest, so the picture changes gently instead of suddenly. Two things move it down:
//  - the frame rate: frames keep arriving later than the target (the device cannot keep up);
//  - heat: the longer the 3D view runs without a pause, the lower the best allowed step ("floor"), a
//    step every couple of minutes on phones (a slower and shorter way on computers). Pauses (the board
//    or the dashboard full screen, the app in the background) let the floor come back up the same way.
// It moves back up only after a long stretch of smooth frames, and waits longer each time a step up had
// to be undone soon after. Pure functions here (tested); the React side is in OfficeScene.

export interface QualityStep {
  /** Share of the extra sharpness above 1 pixel per CSS pixel (0 = 1x, 1 = the device's best up to 2x). */
  sharpness: number;
  ao: boolean; // soft shadows in corners and under furniture
  glow: boolean; // bloom and vignette
  effects: boolean; // the post-processing pass at all (off: plain rendering with the same colours)
  msaa: boolean; // smoother edges inside the effects pass
  fps: 60 | 30;
  simpleLights: boolean; // one key light instead of the ceiling downlights
}

export const LADDER: QualityStep[] = [
  { sharpness: 1, ao: true, glow: true, effects: true, msaa: true, fps: 60, simpleLights: false },
  { sharpness: 0.8, ao: true, glow: true, effects: true, msaa: true, fps: 60, simpleLights: false },
  { sharpness: 0.6, ao: true, glow: true, effects: true, msaa: true, fps: 60, simpleLights: false },
  { sharpness: 0.6, ao: false, glow: true, effects: true, msaa: true, fps: 60, simpleLights: false },
  { sharpness: 0.45, ao: false, glow: true, effects: true, msaa: false, fps: 60, simpleLights: false },
  { sharpness: 0.3, ao: false, glow: false, effects: true, msaa: false, fps: 60, simpleLights: false },
  { sharpness: 0.3, ao: false, glow: false, effects: false, msaa: false, fps: 60, simpleLights: false },
  { sharpness: 0.15, ao: false, glow: false, effects: false, msaa: false, fps: 60, simpleLights: false },
  { sharpness: 0, ao: false, glow: false, effects: false, msaa: false, fps: 30, simpleLights: false },
  { sharpness: 0, ao: false, glow: false, effects: false, msaa: false, fps: 30, simpleLights: true },
];
export const LOWEST = LADDER.length - 1;

export interface Tuning {
  /** The lowest step heat alone may bring the floor to. */
  comfort: number;
  /** Running time that lowers the floor by one step (and pause time that raises it by one). */
  heatStepMs: number;
}
export const PHONE: Tuning = { comfort: 6, heatStepMs: 100_000 };
export const COMPUTER: Tuning = { comfort: 2, heatStepMs: 240_000 };

/** How often the frame rate is judged. */
export const WINDOW_MS = 2000;
const SLOW = 0.8; // below this share of the target frame rate a window counts as slow
const SMOOTH = 0.93; // at or above it, as smooth
const SLOW_WINDOWS = 2; // slow windows in a row before a step down
const MIN_GAP_MS = 4000; // between two steps down
const UP_WAIT_MS = 30_000; // smooth time before a step up (doubles after a step up that did not hold)
const MAX_UP_WAIT_MS = 300_000;

export interface QualityState {
  level: number;
  heat: number; // ms of running time not yet cooled off
  slow: number; // slow windows in a row
  smoothMs: number; // smooth time in a row
  changedAt: number;
  lastUp: number;
  upWait: number;
}

export const initialQuality = (): QualityState => ({ level: 0, heat: 0, slow: 0, smoothMs: 0, changedAt: -1e12, lastUp: -1e12, upWait: UP_WAIT_MS });

/** The best step heat allows right now. */
export const floorOf = (s: QualityState, t: Tuning) => Math.min(t.comfort, Math.floor(s.heat / t.heatStepMs));

/**
 * One judging window: `dt` ms passed, the 3D view was `running` (drawn, visible) or not, and `ratio` is
 * frames drawn / frames wanted in that window (null when it cannot be judged: paused, loading, just changed).
 */
export function stepQuality(s: QualityState, w: { now: number; dt: number; running: boolean; ratio: number | null }, t: Tuning): QualityState {
  const n = { ...s };
  n.heat = Math.max(0, Math.min(t.comfort * t.heatStepMs, n.heat + (w.running ? w.dt : -w.dt)));
  const floor = floorOf(n, t);
  if (n.level < floor) { n.level = floor; n.changedAt = w.now; n.smoothMs = 0; }
  if (w.ratio === null) { n.slow = 0; return n; }
  if (w.ratio < SLOW) { n.slow++; n.smoothMs = 0; }
  else if (w.ratio >= SMOOTH) { n.slow = 0; n.smoothMs += w.dt; }
  else { n.slow = 0; n.smoothMs = 0; }
  if (n.slow >= SLOW_WINDOWS && n.level < LOWEST && w.now - n.changedAt >= MIN_GAP_MS) {
    // A step up that had to be undone within a minute: wait longer before trying again.
    if (w.now - n.lastUp < 60_000) n.upWait = Math.min(MAX_UP_WAIT_MS, n.upWait * 2);
    n.level++; n.changedAt = w.now; n.slow = 0; n.smoothMs = 0;
  } else if (n.smoothMs >= n.upWait && n.level > floor && w.now - n.changedAt >= n.upWait) {
    n.level--; n.changedAt = w.now; n.lastUp = w.now; n.smoothMs = 0;
  }
  return n;
}

/** Device pixel ratio for a step (`max`: the device's, capped at 2). */
export const dprOf = (step: QualityStep, max: number) => 1 + (Math.max(1, max) - 1) * step.sharpness;
