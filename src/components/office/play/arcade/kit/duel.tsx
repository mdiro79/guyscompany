'use client';
import { useEffect, useMemo, useRef } from 'react';
import { WorldStage, type Game3, type World } from './World';
import type { GameApi } from './types';
import { Fx, type G } from './fx';
import { arcadeNet } from '../net';
import type { RtProps } from '../VersusShell';

// Two players at the same time (air hockey, pong). The host's device runs the game: it reads its own
// player's input, receives the other's over the quick channel and sends everyone the state thirty times a
// second. The other device runs the very same simulation in between, so motion stays smooth, and takes
// the host's state whenever one arrives; it decides nothing itself (no goals, no powers). Each player
// sees their own side at the bottom of the screen.

export interface Pt { x: number; y: number }
export interface DuelSim {
  /** One step. `auth`: this device decides goals and powers (the host). A guest only predicts motion. */
  step(dt: number, inputs: (Pt | null)[], auth: boolean): void;
  snap(): unknown;
  /** Takes the host's state; `me` is this device's seat, whose own paddle is left alone (it follows the hand at once). */
  load(snap: unknown, me: number): void;
  /** The computer's target for a seat. */
  bot(seat: number, dt: number): Pt;
  /** Puts the table and everything on it into the 3D world for this frame. */
  render(w: World, t: number, names: string[], colors: string[]): void;
  /** Texts over the picture (scores, names, "Goal!"). */
  hud(g: G, w: World, t: number, names: string[], colors: string[]): void;
  winner(): number; // -1 while the match runs
}
export interface Control { pointer: Pt | null; left: boolean; right: boolean; up: boolean; down: boolean }
const SEND_MS = 33;

export function DuelStage({ rt, size, make, control }: {
  rt: RtProps; size: [number, number];
  make: (fx: Fx, sound: boolean) => DuelSim;
  /** The player's target in field coordinates, from the pointer (already in field coordinates) and the keys. */
  control: (c: Control, seat: number, last: Pt, dt: number) => Pt;
}) {
  const ref = useRef(rt);
  ref.current = rt;
  const api = useMemo<GameApi>(() => ({ seed: 1, phone: rt.phone, rtl: rt.rtl, score() {}, hud() {}, end() {}, running: () => true, t: (k, v) => ref.current.t(k, v) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const remote = useRef<Pt | null>(null), incoming = useRef<unknown>(null);
  useEffect(() => arcadeNet.onFast((_from, m) => {
    if (ref.current.host) { if (m.k === 'i' && typeof m.x === 'number' && typeof m.y === 'number' && Number.isFinite(m.x) && Number.isFinite(m.y)) remote.current = { x: m.x, y: m.y }; }
    else if (m.k === 's') incoming.current = m.s;
  }), []);
  return (
    <WorldStage api={api} size={size} init={(w) => {
      const fx = new Fx(), sim = make(fx, true);
      const seat = ref.current.seat, other = 1 - seat, [fw, fh] = size;
      const c: Control = { pointer: null, left: false, right: false, up: false, down: false };
      let mine: Pt = { x: fw / 2, y: seat === 0 ? fh - 60 : 60 }, lastSend = 0, done = false;
      // Everyone looks at the table from their own end.
      w.spin = seat === 1 ? Math.PI : 0;
      w.tilt = 0.62;
      const game: Game3 = {
        step(dt) {
          fx.step(dt);
          const r = ref.current;
          if (r.room.status !== 'play') return;
          mine = control(c, seat, mine, dt);
          const inputs: (Pt | null)[] = [null, null];
          inputs[seat] = mine;
          if (r.host) {
            inputs[other] = r.bots[other] ? sim.bot(other, dt) : remote.current;
            sim.step(dt, inputs, true);
            const win = sim.winner();
            if (win >= 0 && !done) { done = true; arcadeNet.sendFast({ k: 's', s: sim.snap() }); r.finish([win]); }
          } else {
            if (incoming.current) { try { sim.load(incoming.current, seat); } catch { /* a damaged snapshot is skipped */ } incoming.current = null; }
            sim.step(dt, inputs, false);
          }
          const now = performance.now();
          if (now - lastSend > SEND_MS) {
            lastSend = now;
            if (r.host) arcadeNet.sendFast({ k: 's', s: sim.snap() }); else arcadeNet.sendFast({ k: 'i', x: Math.round(mine.x), y: Math.round(mine.y) });
          }
        },
        render(world, t) { const r = ref.current; sim.render(world, t, r.names, r.colors); },
        hud(g, world, t) {
          const r = ref.current;
          fx.begin(g);
          sim.hud(g, world, t, r.names, r.colors);
          fx.draw(g, world.pal);
          fx.end(g, 4000, 4000);
        },
        pointer(e) { c.pointer = e.type === 'up' && ref.current.phone ? null : { x: e.x, y: e.y }; },
        key(code, down) {
          // Left and right are as the player sees them.
          const flip = seat === 1;
          if (code === 'ArrowLeft' || code === 'KeyA') { if (flip) c.right = down; else c.left = down; }
          else if (code === 'ArrowRight' || code === 'KeyD') { if (flip) c.left = down; else c.right = down; }
          else if (code === 'ArrowUp' || code === 'KeyW') { if (flip) c.down = down; else c.up = down; }
          else if (code === 'ArrowDown' || code === 'KeyS') { if (flip) c.up = down; else c.down = down; }
          if (down) c.pointer = null;
        },
      };
      return game;
    }} />
  );
}
