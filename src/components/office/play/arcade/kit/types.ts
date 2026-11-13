import type { G } from './fx';

/** What the shell gives every solo game. */
export interface GameApi {
  seed: number; // the same for everyone in a race
  phone: boolean;
  rtl: boolean;
  /** Shows the score (and tells the others in a race). */
  score(n: number): void;
  /** A short line next to the score (lives, level, time left); null hides it. */
  hud(text: string | null): void;
  /** The round is over with this final score. */
  end(score: number): void;
  /** False while paused, before the start and after the end: the game must not advance. */
  running(): boolean;
  /** Text of this game in the page's language. */
  t(key: string, values?: Record<string, string | number>): string;
}

export type Dir = 'left' | 'right' | 'up' | 'down';
export interface Pointer { type: 'down' | 'move' | 'up'; x: number; y: number; id: number }
interface Controls {
  /** Raw pointer events in the game's own coordinates. */
  pointer?(p: Pointer): void;
  /** A short press without movement. */
  tap?(x: number, y: number): void;
  /** A stroke of a finger or the mouse; fires once per stroke segment, so strokes can be chained. */
  swipe?(dir: Dir): void;
  key?(code: string, down: boolean): void;
  dispose?(): void;
}
export interface Game2D extends Controls {
  /** Advances the game by dt seconds (at most 1/30 s at a time). Only called while running. */
  step?(dt: number): void;
  /** Paints one frame in the game's own coordinates (the stage scales it to the screen). */
  draw(g: G, t: number, dt: number): void;
}
export interface Game3D extends Controls {
  step?(dt: number): void;
  /** Called every frame before rendering, also while paused (camera easing, idle effects). */
  frame?(dt: number, t: number): void;
  resize?(w: number, h: number): void;
}
