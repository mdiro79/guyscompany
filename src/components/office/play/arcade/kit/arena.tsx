'use client';
import { useEffect, useMemo, useRef } from 'react';
import { WorldStage, type World } from './World';
import type { GameApi } from './types';
import { Fx, type G } from './fx';
import { arcadeNet } from '../net';
import type { RtProps } from '../VersusShell';

// Real-time arena games for any number of players (Sumo Bumpers, Coin Rush, Sky Volley). Like Paint
// Trails, the host's device runs the game: it reads its own player's controls, receives everyone else's
// over the quick channel and sends the whole state twenty times a second. The other devices keep things
// moving between two messages (`predict`) and take the host's state whenever it arrives.
//
// Controls are the same in every arena game: the mouse pointer or a finger on the field is where your
// piece heads for; arrows/WASD steer directly; a click, a quick tap or Space makes a dash.

export interface ArenaInput {
  tx: number | null; ty: number | null; // where the pointer or finger is (field units), null: none
  kx: number; ky: number; // keyboard direction (-1..1 each)
  dash: number; // counts up with every dash press (so none is lost between two messages)
}
export const noInput = (): ArenaInput => ({ tx: null, ty: null, kx: 0, ky: 0, dash: 0 });

export interface ArenaCtx {
  n: number; seat: number; fx: Fx;
  names: () => string[]; colors: () => string[]; bots: () => boolean[];
  t(key: string, values?: Record<string, string | number>): string;
  /** Where a field point is on the 2D layer (valid after the first frame). */
  to2d(x: number, y: number, z?: number): [number, number];
}

export interface ArenaSim {
  /** The host's step: `inputs[i]` is seat i's controls (a computer's seat gets its own from `bot`). */
  step(dt: number, inputs: ArenaInput[]): void;
  /** The computer's controls for a seat. */
  bot(seat: number, dt: number): ArenaInput;
  /** A guest's step between two messages: keep things moving, decide nothing. */
  predict(dt: number): void;
  snap(): unknown;
  load(s: unknown): void;
  render(w: World, t: number, dt: number): void;
  hud(g: G, w: World, t: number): void;
  /** Winning seats once the match is over (empty while it runs). */
  winners(): number[];
  /** Turns the camera so this seat's side is nearest (radians); 0 by default. */
  spin?(seat: number): number;
}

const SEND_MS = 50;

/** Steering helper: the velocity a piece wants from its controls (pointer target first, then keys). */
export function wanted(inp: ArenaInput, x: number, y: number, speed: number, slowWithin = 36): [number, number] {
  if (inp.kx || inp.ky) { const l = Math.hypot(inp.kx, inp.ky) || 1; return [(inp.kx / l) * speed, (inp.ky / l) * speed]; }
  if (inp.tx === null || inp.ty === null) return [0, 0];
  const dx = inp.tx - x, dy = inp.ty - y, d = Math.hypot(dx, dy);
  if (d < 2) return [0, 0];
  const k = Math.min(1, d / slowWithin) * speed / d;
  return [dx * k, dy * k];
}

export function ArenaStage({ rt, size, tilt = 0.5, table = true, make }: { rt: RtProps; size: [number, number]; tilt?: number; table?: boolean; make: (c: ArenaCtx) => ArenaSim }) {
  const ref = useRef(rt);
  ref.current = rt;
  const api = useMemo<GameApi>(() => ({ seed: 1, phone: rt.phone, rtl: rt.rtl, score() {}, hud() {}, end() {}, running: () => true, t: (k, v) => ref.current.t(k, v) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const remote = useRef(new Map<number, ArenaInput>()), incoming = useRef<unknown>(null);
  useEffect(() => arcadeNet.onFast((from, m) => {
    const r = ref.current;
    if (r.host) {
      const seat = r.room.seats.findIndex((s) => s.k === 'human' && s.id === from);
      if (m.k !== 'i' || seat < 0) return;
      const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
      remote.current.set(seat, { tx: num(m.x, -2000, 4000), ty: num(m.y, -2000, 4000), kx: num(m.kx, -1, 1) ?? 0, ky: num(m.ky, -1, 1) ?? 0, dash: num(m.d, 0, 1e9) ?? 0 });
    } else if (m.k === 's') incoming.current = m.s;
  }), []);
  return (
    <WorldStage api={api} size={size} table={table} init={(w) => {
      w.tilt = tilt;
      const r0 = ref.current, n = r0.room.seats.length, seat = r0.seat;
      const fx = new Fx();
      let proj: ArenaCtx['to2d'] = (x, y) => [x, y];
      const sim = make({
        n, seat, fx, t: (k, v) => ref.current.t(k, v),
        names: () => ref.current.names, colors: () => ref.current.colors, bots: () => ref.current.bots,
        to2d: (x, y, z) => proj(x, y, z),
      });
      w.spin = sim.spin?.(seat) ?? 0;
      const flip = Math.abs(w.spin - Math.PI) < 0.01;
      const mine: ArenaInput = noInput();
      const keys = { l: false, r: false, u: false, d: false };
      let lastSend = 0, done = false;
      const keyDir = () => {
        const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ky = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
        mine.kx = flip ? -kx : kx; mine.ky = flip ? -ky : ky;
      };
      return {
        step(dt) {
          fx.step(dt);
          const r = ref.current;
          if (r.room.status !== 'play') return;
          if (r.host) {
            const inputs = Array.from({ length: n }, (_, i) => (i === seat ? mine : r.bots[i] ? sim.bot(i, dt) : remote.current.get(i) ?? noInput()));
            sim.step(dt, inputs);
            const win = sim.winners();
            if (win.length && !done) { done = true; arcadeNet.sendFast({ k: 's', s: sim.snap() }); r.finish(win); }
          } else {
            if (incoming.current) { try { sim.load(incoming.current); } catch { /* a damaged snapshot is skipped */ } incoming.current = null; }
            sim.predict(dt);
          }
          const now = performance.now();
          if (now - lastSend > SEND_MS) {
            lastSend = now;
            if (r.host) arcadeNet.sendFast({ k: 's', s: sim.snap() });
            else arcadeNet.sendFast({ k: 'i', x: mine.tx === null ? null : Math.round(mine.tx), y: mine.ty === null ? null : Math.round(mine.ty), kx: mine.kx, ky: mine.ky, d: mine.dash });
          }
        },
        render(world, t, dt) { proj = world.to2d; sim.render(world, t, dt); },
        hud(g, world, t) {
          fx.begin(g);
          sim.hud(g, world, t);
          fx.draw(g, world.pal);
          fx.end(g, 4000, 4000);
        },
        pointer(e) {
          // A finger lifted lets the piece coast; the mouse keeps steering wherever it is.
          if (e.type === 'up' && ref.current.phone) { mine.tx = mine.ty = null; return; }
          mine.tx = e.x; mine.ty = e.y;
          if (e.type === 'down') { keys.l = keys.r = keys.u = keys.d = false; keyDir(); }
        },
        tap() { mine.dash++; },
        key(code, down) {
          if (code === 'Space') { if (down) mine.dash++; return; }
          if (code === 'ArrowLeft' || code === 'KeyA') keys.l = down;
          else if (code === 'ArrowRight' || code === 'KeyD') keys.r = down;
          else if (code === 'ArrowUp' || code === 'KeyW') keys.u = down;
          else if (code === 'ArrowDown' || code === 'KeyS') keys.d = down;
          else return;
          keyDir();
          if (down) mine.tx = mine.ty = null;
        },
      };
    }} />
  );
}
