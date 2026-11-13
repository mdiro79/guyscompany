'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WorldStage, type Game3 } from '../kit/World';
import type { GameApi } from '../kit/types';
import { Fx, label, write } from '../kit/fx';
import { buzz, sfx } from '../kit/sfx';
import { arcadeNet } from '../net';
import type { RtProps } from '../VersusShell';

// Paint Trails. Every player is a paint roller that never stops and leaves a wall of paint behind. As
// many as like can play (the field grows with them). Touching a wall or any paint, one's own included,
// knocks a roller out; the last one rolling wins the round and three rounds win the match. Trails have a
// gap now and then, and powers lie around: speed, ghost (pass through paint), sponge (all paint gone) and
// snail (everyone else slows down).
// The host's device runs the game and sends everyone the rollers' places twenty times a second; the
// others send only where they want to steer.

const SPEED = 104, TURN = 3.3, CELL = 4, SEG = 9, WIN = 3;
type Kind = 'boost' | 'ghost' | 'wipe' | 'snail';
const KINDS: Kind[] = ['boost', 'ghost', 'wipe', 'snail'];
const ICON: Record<Kind, string> = { boost: '⚡', ghost: '👻', wipe: '🧽', snail: '🐌' };
interface Roller { x: number; y: number; a: number; alive: boolean; boost: number; ghost: number; slow: number; gapIn: number; gap: number; want: number | null; turn: number; lines: number[][]; open: boolean }
const CTL_KEY = 'gc-trails-control';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export default function Trails(rt: RtProps) {
  const ref = useRef(rt);
  ref.current = rt;
  const n = rt.room.seats.length, S = 520 + Math.max(0, n - 2) * 110;
  const [mode, setMode] = useState<'mouse' | 'keys'>('mouse');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => { try { if (localStorage.getItem(CTL_KEY) === 'keys') setMode('keys'); } catch { /* storage blocked */ } }, []);
  const choose = (m: 'mouse' | 'keys') => { setMode(m); try { localStorage.setItem(CTL_KEY, m); } catch { /* storage blocked */ } };
  const api = useMemo<GameApi>(() => ({ seed: 1, phone: rt.phone, rtl: rt.rtl, score() {}, hud() {}, end() {}, running: () => true, t: (k, v) => ref.current.t(k, v) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const inputs = useRef(new Map<number, { a: number | null; t: number }>()), incoming = useRef<Snap | null>(null);
  useEffect(() => arcadeNet.onFast((from, m) => {
    const r = ref.current;
    if (r.host) {
      const seat = r.room.seats.findIndex((s) => s.k === 'human' && s.id === from);
      if (m.k === 'i' && seat >= 0) inputs.current.set(seat, { a: typeof m.a === 'number' && Number.isFinite(m.a) ? m.a : null, t: m.t === 1 || m.t === -1 ? m.t : 0 });
    } else if (m.k === 's') incoming.current = m.s as Snap;
  }), []);
  return (
    <div className="absolute inset-0 flex flex-col gap-2">
      <div className="relative min-h-0 flex-1">
        <WorldStage api={api} size={[S, S]} init={(w) => { w.tilt = 0.42; return create(ref, S, n, modeRef, inputs, incoming); }} />
      </div>
      {!rt.phone && (
        <div className="flex shrink-0 justify-center gap-2 pb-1">
          {(['mouse', 'keys'] as const).map((m) => (
            <button key={m} type="button" onClick={(e) => { e.currentTarget.blur(); choose(m); }} aria-pressed={mode === m}
              className={`min-h-10 rounded-xl border-2 border-[var(--a-edge)] px-4 text-sm font-bold ${mode === m ? 'bg-[#ffc93c] text-[#2b2440]' : 'bg-[var(--a-card)]'}`}>{rt.t(m === 'mouse' ? 'modeMouse' : 'modeKeys')}</button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Snap { r: number; ph: number; tm: number; w: number; pl: number[][]; pts: number[]; pk: number[][]; win: number }

function create(ref: React.RefObject<RtProps>, S: number, n: number, modeRef: React.RefObject<'mouse' | 'keys'>, remote: React.RefObject<Map<number, { a: number | null; t: number }>>, incoming: React.RefObject<Snap | null>): Game3 {
  const fx = new Fx(), G = Math.ceil(S / CELL);
  const owner = new Uint8Array(G * G), stamp = new Float32Array(G * G);
  const pl: Roller[] = Array.from({ length: n }, () => ({ x: 0, y: 0, a: 0, alive: true, boost: 0, ghost: 0, slow: 0, gapIn: 2, gap: 0, want: null, turn: 0, lines: [], open: false }));
  const pts = new Array<number>(n).fill(0);
  let picks: { x: number; y: number; kind: Kind }[] = [], pickIn = 3, round = 0, phase: 'count' | 'play' | 'over' = 'count', timer = 2.4, time = 0, wipes = 0, lastWin = -1, done = false, lastSend = 0;
  let seenRound = -1, seenWipes = 0, proj: (x: number, y: number, z?: number) => [number, number] = (x, y) => [x, y];
  const me = () => ref.current!.seat;
  const keys = { left: false, right: false };
  let pointer: [number, number] | null = null, dragFrom: [number, number] | null = null, myWant: number | null = null;

  const point = (p: Roller, force = false) => {
    // The trail as it is drawn: a new corner every few units.
    if (!p.open) { p.lines.push([p.x, p.y]); p.open = true; return; }
    const line = p.lines[p.lines.length - 1], lx = line[line.length - 2], ly = line[line.length - 1];
    if (force || (p.x - lx) ** 2 + (p.y - ly) ** 2 >= SEG * SEG) line.push(p.x, p.y);
  };
  const clearPaint = () => { owner.fill(0); for (const p of pl) { p.lines = []; p.open = false; } };
  const newRound = () => {
    round++; clearPaint(); picks = []; pickIn = 3; phase = 'count'; timer = 2.4;
    pl.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2 + round * 0.9;
      Object.assign(p, { x: S / 2 + Math.cos(a) * S * 0.33, y: S / 2 + Math.sin(a) * S * 0.33, a: a + Math.PI + 0.75, alive: true, boost: 0, ghost: 0, slow: 0, gapIn: 1.5 + Math.random() * 2, gap: 0, want: null, turn: 0 });
    });
  };
  newRound();
  const cell = (x: number, y: number) => Math.floor(y / CELL) * G + Math.floor(x / CELL);
  const blocked = (x: number, y: number, who: number) => {
    if (x < 5 || y < 5 || x > S - 5 || y > S - 5) return true;
    const c = cell(x, y);
    return owner[c] > 0 && (owner[c] !== who + 1 || time - stamp[c] > 0.5);
  };
  const paint = (x: number, y: number, who: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gy < 0 || gx >= G || gy >= G) continue;
      const c = gy * G + gx;
      if (!owner[c]) { owner[c] = who + 1; stamp[c] = time; }
    }
  };
  const free = (p: Roller, a: number, who: number) => { let d = 0; while (d < 170 && !blocked(p.x + Math.cos(a) * (d + 8), p.y + Math.sin(a) * (d + 8), who)) d += 7; return d; };
  const botSteer = (p: Roller, who: number) => {
    let best = 0, bestV = -1;
    for (const off of [0, -0.45, 0.45, -0.9, 0.9, -1.4, 1.4]) { const v = free(p, p.a + off, who) + (off === 0 ? 14 : 0) + Math.random() * 6; if (v > bestV) { bestV = v; best = off; } }
    const near = picks.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < 130);
    if (near && bestV > 60) { const want = Math.atan2(near.y - p.y, near.x - p.x); if (free(p, want, who) > 60) return want; }
    return p.a + best;
  };
  const die = (p: Roller, i: number) => {
    p.alive = false; p.open = false;
    const c = ref.current!.colors[i], [x, y] = proj(p.x, p.y, 8);
    fx.confetti(x, y, [c, '#ffffff'], 26, 260); fx.shake(i === me() ? 9 : 4, 0.35);
    sfx.boom(); if (i === me()) buzz(90);
  };

  const hostStep = (dt: number) => {
    const r = ref.current!;
    if (phase === 'count') { timer -= dt; if (timer <= 0) { phase = 'play'; sfx.start(); } return; }
    if (phase === 'over') {
      timer -= dt;
      if (timer <= 0) { const top = pts.findIndex((v) => v >= WIN); if (top >= 0) { if (!done) { done = true; r.finish([top]); } } else newRound(); }
      return;
    }
    pl.forEach((p, i) => {
      if (!p.alive) return;
      // Where this roller wants to go: me, a teammate's device, or the computer.
      if (i === r.seat) { p.want = myWant; p.turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); }
      else if (r.bots[i]) { p.want = botSteer(p, i); p.turn = 0; }
      else { const inp = remote.current!.get(i); p.want = inp?.a ?? null; p.turn = inp?.t ?? 0; }
      if (p.turn) p.a += p.turn * TURN * dt;
      else if (p.want !== null) { const d = wrap(p.want - p.a); p.a += Math.max(-TURN * dt, Math.min(TURN * dt, d)); }
      p.boost = Math.max(0, p.boost - dt); p.ghost = Math.max(0, p.ghost - dt); p.slow = Math.max(0, p.slow - dt);
      const sp = SPEED * (p.boost > 0 ? 1.6 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + Math.min(0.35, round * 0.04));
      const ox = p.x, oy = p.y;
      p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt;
      if (p.gap > 0) { p.gap -= dt; if (p.gap <= 0) p.gapIn = 2.6 + Math.random() * 2.2; } else { p.gapIn -= dt; if (p.gapIn <= 0) { p.gap = 0.34; p.open = false; } }
      const hx = p.x + Math.cos(p.a) * 4, hy = p.y + Math.sin(p.a) * 4;
      if (hx < 5 || hy < 5 || hx > S - 5 || hy > S - 5 || (p.ghost <= 0 && blocked(hx, hy, i))) { die(p, i); return; }
      if (p.gap <= 0 && p.ghost <= 0) { paint(ox, oy, i); point(p); } else p.open = false;
      for (const k of picks) {
        if (Math.hypot(k.x - p.x, k.y - p.y) > 15) continue;
        picks = picks.filter((o) => o !== k);
        if (k.kind === 'boost') p.boost = 3; else if (k.kind === 'ghost') { p.ghost = 2.6; p.open = false; } else if (k.kind === 'snail') pl.forEach((o, j) => { if (j !== i) o.slow = 3; }); else { clearPaint(); wipes++; }
        sfx.good();
        break;
      }
    });
    pickIn -= dt;
    if (pickIn <= 0 && picks.length < 3) { pickIn = 4.5; picks.push({ x: 40 + Math.random() * (S - 80), y: 40 + Math.random() * (S - 80), kind: KINDS[Math.floor(Math.random() * KINDS.length)] }); }
    const alive = pl.flatMap((p, i) => (p.alive ? [i] : []));
    if (alive.length <= 1) { lastWin = alive[0] ?? -1; if (lastWin >= 0) pts[lastWin]++; phase = 'over'; timer = 2.4; if (lastWin >= 0) sfx.win(); }
  };
  const snap = (): Snap => ({ r: round, ph: phase === 'count' ? 0 : phase === 'play' ? 1 : 2, tm: Math.round(timer * 10), w: wipes, pts, win: lastWin, pk: picks.map((k) => [Math.round(k.x), Math.round(k.y), KINDS.indexOf(k.kind)]),
    pl: pl.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.a * 100), (p.alive ? 1 : 0) | (p.gap > 0 || p.ghost > 0 ? 2 : 0) | (p.boost > 0 ? 4 : 0) | (p.slow > 0 ? 8 : 0) | (p.ghost > 0 ? 16 : 0)]) });
  const guestLoad = (s: Snap) => {
    if (s.r !== seenRound || s.w !== seenWipes) { for (const p of pl) { p.lines = []; p.open = false; } if (s.r !== seenRound && seenRound >= 0) sfx.start(); seenRound = s.r; seenWipes = s.w; }
    round = s.r; phase = s.ph === 0 ? 'count' : s.ph === 1 ? 'play' : 'over'; timer = s.tm / 10; lastWin = s.win;
    s.pts.forEach((v, i) => { if (i < n) pts[i] = v; });
    picks = s.pk.map((k) => ({ x: k[0], y: k[1], kind: KINDS[k[2]] ?? 'boost' }));
    s.pl.forEach((v, i) => {
      const p = pl[i];
      if (!p) return;
      const was = p.alive, flags = v[3];
      p.x = v[0]; p.y = v[1]; p.a = v[2] / 100; p.alive = !!(flags & 1); p.boost = flags & 4 ? 1 : 0; p.slow = flags & 8 ? 1 : 0; p.ghost = flags & 16 ? 1 : 0;
      if (was && !p.alive) die(p, i);
      if (p.alive && !(flags & 2) && phase === 'play') point(p); else p.open = false;
    });
  };

  return {
    step(dt) {
      time += dt; fx.step(dt);
      const r = ref.current!;
      if (r.room.status !== 'play') return;
      // Steering of this device's roller.
      const mine = pl[r.seat];
      if (r.phone) { /* set while dragging (see pointer) */ }
      else if (modeRef.current === 'mouse' && pointer && mine) myWant = Math.hypot(pointer[0] - mine.x, pointer[1] - mine.y) > 14 ? Math.atan2(pointer[1] - mine.y, pointer[0] - mine.x) : myWant;
      else if (modeRef.current === 'keys') myWant = null;
      if (r.host) hostStep(dt);
      else {
        if (incoming.current) { guestLoad(incoming.current); incoming.current = null; }
        // Between two messages the rollers keep rolling the way they were.
        if (phase === 'play') for (const p of pl) if (p.alive) { const sp = SPEED * (p.boost > 0 ? 1.6 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + Math.min(0.35, round * 0.04)); p.x += Math.cos(p.a) * sp * dt; p.y += Math.sin(p.a) * sp * dt; }
      }
      const now = performance.now();
      if (now - lastSend > 50) {
        lastSend = now;
        if (r.host) arcadeNet.sendFast({ k: 's', s: snap() }); else arcadeNet.sendFast({ k: 'i', a: myWant === null ? null : Math.round(myWant * 100) / 100, t: (keys.right ? 1 : 0) - (keys.left ? 1 : 0) });
      }
    },
    render(w, t) {
      const p = w.pal, { colors } = ref.current!;
      proj = w.to2d;
      w.box(S / 2, S / 2, S, S, 4, p.paper, { z: -4 });
      const wall = p.dark ? '#4a3f78' : '#f0e2c8';
      for (const v of [-6, S + 6]) { w.box(v, S / 2, 12, S + 24, 16, wall); w.box(S / 2, v, S + 24, 12, 16, wall); }
      pl.forEach((r, i) => {
        // Paint: one low wall per stretch of trail.
        for (const line of r.lines) for (let k = 2; k < line.length; k += 2) {
          const x0 = line[k - 2], y0 = line[k - 1], x1 = line[k], y1 = line[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
          w.box((x0 + x1) / 2, (y0 + y1) / 2, len + 4, 5, 7, colors[i], { rot: Math.atan2(y1 - y0, x1 - x0) });
        }
        if (!r.alive) return;
        // From the last corner to the roller itself.
        const line = r.open ? r.lines[r.lines.length - 1] : null;
        if (line) { const x0 = line[line.length - 2], y0 = line[line.length - 1], len = Math.hypot(r.x - x0, r.y - y0); if (len > 0.5) w.box((x0 + r.x) / 2, (y0 + r.y) / 2, len + 2, 5, 7, colors[i], { rot: Math.atan2(r.y - y0, r.x - x0) }); }
        const float = r.ghost > 0 ? 8 + Math.sin(t * 12) * 2 : 0;
        w.box(r.x, r.y, 9, 16, 9, r.ghost > 0 ? '#ffffff' : colors[i], { rot: r.a, z: float + 1 });
        w.box(r.x - Math.cos(r.a) * 8, r.y - Math.sin(r.a) * 8, 8, 4, 4, p.dark ? '#0e0a1c' : '#2b2440', { rot: r.a, z: float + 3 });
        w.cone(r.x + Math.cos(r.a) * 9, r.y + Math.sin(r.a) * 9, 4, 9, r.boost > 0 ? p.sun : p.white, { flat: true, rot: r.a, z: float });
      });
      for (const k of picks) w.ball(k.x, k.y, 10, k.kind === 'boost' ? p.sun : k.kind === 'ghost' ? p.white : k.kind === 'wipe' ? p.sky : p.mint, 6 + Math.sin(t * 5 + k.x) * 3);
    },
    hud(g, w, t) {
      const p = w.pal, { names, colors, seat } = ref.current!;
      fx.begin(g);
      for (const k of picks) { const [x, y] = w.to2d(k.x, k.y, 26); write(g, p, ICON[k.kind], x, y, 15, 800); }
      pl.forEach((r, i) => {
        if (!r.alive) return;
        const [x, y] = w.to2d(r.x, r.y, 22);
        write(g, p, i === seat ? `▼ ${names[i]}` : names[i], x, y - 8, 11, 800, colors[i], 120);
      });
      // Rounds won, in a row along the top
      const [tx, ty] = w.to2d(S / 2, -18, 0), step = Math.min(110, 420 / n);
      pts.forEach((v, i) => write(g, p, `${names[i].slice(0, 8)} ${'●'.repeat(v)}${'○'.repeat(Math.max(0, WIN - v))}`, tx + (i - (n - 1) / 2) * step, Math.max(14, ty - 6), 11, 800, colors[i], step - 6));
      const [cx, cy] = w.to2d(S / 2, S / 2, 10);
      if (phase === 'count') { label(g, p, ref.current!.t('round', { n: round }), cx, cy - 34, 22, p.white); label(g, p, String(Math.max(1, Math.ceil(timer))), cx, cy + 12, 48, p.sun); }
      else if (phase === 'over') label(g, p, lastWin >= 0 ? ref.current!.t('wonRound', { name: names[lastWin] }) : ref.current!.t('noWinner'), cx, cy, 24, lastWin >= 0 ? colors[lastWin] : p.white, 520);
      void t;
      fx.draw(g, p);
      fx.end(g, 4000, 4000);
    },
    pointer(e) {
      const r = ref.current!;
      if (!r.phone) { if (e.type !== 'up') pointer = [e.x, e.y]; return; }
      // A finger dragged anywhere: the roller turns to the way the finger moves.
      if (e.type === 'down') dragFrom = [e.x, e.y];
      else if (e.type === 'move' && dragFrom) { const dx = e.x - dragFrom[0], dy = e.y - dragFrom[1]; if (Math.hypot(dx, dy) > 16) { myWant = Math.atan2(dy, dx); dragFrom = [dragFrom[0] + dx * 0.5, dragFrom[1] + dy * 0.5]; } }
      else if (e.type === 'up') dragFrom = null;
    },
    key(code, down) {
      if (code === 'ArrowLeft' || code === 'KeyA') keys.left = down; else if (code === 'ArrowRight' || code === 'KeyD') keys.right = down;
    },
  };
}
