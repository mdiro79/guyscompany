'use client';
import { useEffect, useRef } from 'react';
import type { Dir, Game2D, Game3D, GameApi } from './types';

// The surface a game draws on. A 2D game works in its own fixed coordinates (say 360 × 600); the stage
// scales that to whatever room there is and keeps it sharp. Input arrives in the same coordinates.

const MAX_DT = 1 / 30;
const IDLE_MS = 2500;
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

interface Wiring { toGame(clientX: number, clientY: number): [number, number]; swipeMin: number }

// Pointer, tap, swipe and keyboard handling shared by both stages.
function wireInput(el: HTMLElement, game: Game2D | Game3D, w: Wiring) {
  const strokes = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* already released */ }
    const [x, y] = w.toGame(e.clientX, e.clientY);
    strokes.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    game.pointer?.({ type: 'down', x, y, id: e.pointerId });
  };
  const move = (e: PointerEvent) => {
    const [x, y] = w.toGame(e.clientX, e.clientY);
    game.pointer?.({ type: 'move', x, y, id: e.pointerId });
    const s = strokes.get(e.pointerId);
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < w.swipeMin && Math.abs(dy) < w.swipeMin) return;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    s.x = e.clientX; s.y = e.clientY; s.moved = true;
    game.swipe?.(dir);
  };
  const up = (e: PointerEvent) => {
    const [x, y] = w.toGame(e.clientX, e.clientY);
    const s = strokes.get(e.pointerId);
    strokes.delete(e.pointerId);
    game.pointer?.({ type: 'up', x, y, id: e.pointerId });
    if (s && !s.moved && e.type === 'pointerup' && performance.now() - s.t < 600) game.tap?.(x, y);
  };
  const key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.type === 'keydown' && e.repeat) return;
    game.key?.(e.code, e.type === 'keydown');
  };
  const menu = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', menu);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('contextmenu', menu);
    window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
  };
}

export function CanvasStage({ api, size, init }: {
  api: GameApi; size: [number, number]; init: (ctx: { w: number; h: number; api: GameApi }) => Game2D;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const initRef = useRef(init);
  useEffect(() => {
    const el = box.current!, cv = canvas.current!, g = cv.getContext('2d');
    if (!g) return;
    const [vw, vh] = size;
    const game = initRef.current({ w: vw, h: vh, api });
    let scale = 1, dpr = 1, raf = 0, last = 0, start = performance.now();
    const fit = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      scale = Math.min(cw / vw, ch / vh);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Very large stages on dense screens are drawn a little softer to stay fast.
      if (vw * scale * dpr * vh * scale * dpr > 2_600_000) dpr = Math.max(1, Math.sqrt(2_600_000 / (vw * scale * vh * scale)));
      cv.style.width = `${vw * scale}px`; cv.style.height = `${vh * scale}px`;
      cv.width = Math.round(vw * scale * dpr); cv.height = Math.round(vh * scale * dpr);
    };
    let idleSince = 0, dirty = true;
    const refit = () => { fit(); dirty = true; };
    fit();
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
      last = now;
      // A game that stands still (paused, over) is not repainted after its last effects faded.
      if (api.running()) { idleSince = now; game.step?.(dt); }
      else if (now - idleSince > IDLE_MS && !dirty) return;
      dirty = false;
      g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      game.draw(g, (now - start) / 1000, dt);
    };
    last = performance.now(); start = last;
    raf = requestAnimationFrame(loop);
    const unwire = wireInput(cv, game, {
      toGame: (cx, cy) => { const r = cv.getBoundingClientRect(); return [(cx - r.left) / scale, (cy - r.top) / scale]; },
      swipeMin: 22,
    });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); unwire(); game.dispose?.(); };
    // The game is created once per mount; the shell remounts it for a new round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={box} className="absolute inset-x-0 top-0 bottom-2 flex items-center justify-center">
      <canvas ref={canvas} className="block touch-none rounded-2xl border-2 border-[var(--a-edge)] shadow-[0_6px_0_var(--a-edge)]" />
    </div>
  );
}

export interface ThreeCtx {
  THREE: typeof import('three');
  scene: import('three').Scene; camera: import('three').PerspectiveCamera; renderer: import('three').WebGLRenderer;
  api: GameApi; size: { w: number; h: number };
}

export function ThreeStage({ api, init, fov = 55 }: { api: GameApi; init: (ctx: ThreeCtx) => Game3D; fov?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const initRef = useRef(init);
  useEffect(() => {
    const el = box.current!;
    let dead = false, cleanup = () => {};
    // three.js is already on the page inside the office; elsewhere it loads with the first 3D game.
    void import('three').then((THREE) => {
      if (dead) return;
      let renderer: import('three').WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { api.end(0); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, api.phone ? 1.5 : 2));
      renderer.domElement.className = 'block h-full w-full touch-none';
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
      const size = { w: 1, h: 1 };
      const game = initRef.current({ THREE, scene, camera, renderer, api, size });
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        size.w = w; size.h = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        game.resize?.(w, h);
      };
      let idleSince = 0, dirty = true;
      const refit = () => { fit(); dirty = true; };
      fit();
      const ro = new ResizeObserver(refit);
      ro.observe(el);
      let raf = 0, last = performance.now();
      const start = last;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
        last = now;
        if (api.running()) { idleSince = now; game.step?.(dt); }
        else if (now - idleSince > IDLE_MS && !dirty) return;
        dirty = false;
        game.frame?.(dt, (now - start) / 1000);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
      const unwire = wireInput(renderer.domElement, game, {
        toGame: (cx, cy) => { const r = renderer.domElement.getBoundingClientRect(); return [cx - r.left, cy - r.top]; },
        swipeMin: 22,
      });
      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); unwire(); game.dispose?.();
        scene.traverse((o) => {
          const m = o as import('three').Mesh;
          m.geometry?.dispose?.();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          for (const mat of mats) { (mat as import('three').MeshBasicMaterial).map?.dispose?.(); mat.dispose?.(); }
        });
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    });
    return () => { dead = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={box} className="absolute inset-x-0 top-0 bottom-2 overflow-hidden rounded-2xl border-2 border-[var(--a-edge)] shadow-[0_6px_0_var(--a-edge)]" />;
}

/** A soft round glow for additive sprites in the 3D games. */
export function glowTexture(THREE: typeof import('three'), color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color); grad.addColorStop(0.25, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
