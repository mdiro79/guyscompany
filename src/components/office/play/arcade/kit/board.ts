'use client';
import { useMemo, useRef } from 'react';
import type { GameApi } from './types';
import type { BoardProps } from '../rules/types';
import { ball, rrect, tile, write } from './fx';

/**
 * A board is drawn by the same stage as the solo games. This gives it the stage's `api` (always running)
 * and a getter for the newest match state, which the board's drawing code reads every frame.
 */
export function useBoard<S, M>(props: BoardProps<S, M>) {
  const ref = useRef(props);
  ref.current = props;
  return useMemo(() => {
    const get = () => ref.current;
    const api: GameApi = { seed: 1, phone: props.phone, rtl: props.rtl, score() {}, hud() {}, end() {}, running: () => true, t: (k, v) => ref.current.t(k, v) };
    return { api, get };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** A row of player pills along the top of a 3D board's overlay: colour, name, a number, the one to move outlined. */
export function seatPills(g: CanvasRenderingContext2D, p: import('./theme').Palette, items: { name: string; value: string; color: string; active: boolean }[]) {
  const W = g.canvas.clientWidth, n = items.length, gap = 8, w = Math.min(170, (W - 16 - gap * (n - 1)) / n), x0 = (W - (n * w + (n - 1) * gap)) / 2;
  items.forEach((it, i) => {
    const x = x0 + i * (w + gap), y = 8;
    tile(g, p, x, y, w, 34, 17, p.paper, 2, 3);
    if (it.active) { g.strokeStyle = it.color; g.lineWidth = 3; rrect(g, x, y, w, 34, 17); g.stroke(); }
    ballDot(g, p, x + 17, y + 17, 9, it.color);
    g.font = '700 12px "Inter Variable", "Vazirmatn Variable", system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = p.soft;
    g.fillText(it.name, x + 32, y + 18, w - 72);
    write(g, p, it.value, x + w - 22, y + 18, 15, 800);
  });
}
function ballDot(g: CanvasRenderingContext2D, p: import('./theme').Palette, x: number, y: number, r: number, color: string) { ball(g, p, x, y, r, color, 1.5, 0); }
