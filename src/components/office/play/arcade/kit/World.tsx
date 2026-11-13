'use client';
import { useEffect, useRef } from 'react';
import type * as T from 'three';
import type { Dir, GameApi, Pointer } from './types';
import type { G } from './fx';
import { theme, type Palette } from './theme';

// A small 3D stage for the games: toys on a table. A game still thinks in its flat field (x to the right,
// y downwards, in its own units); every frame it says what stands where (boxes, balls, discs, cones) and
// the stage draws them as real 3D shapes with light and shadow, seen from a tilted camera that always
// fits the whole field. All shapes of a kind are one draw call (instancing), so a busy game costs about
// as much as an empty one. A 2D layer on top carries texts and particles; `to2d` gives the place on it
// of a point of the field. Pointer positions arrive in field units (where the pointer's ray meets the table).

export interface Shape { z?: number; rot?: number; lift?: number }
export interface World {
  THREE: typeof T; scene: T.Scene; camera: T.PerspectiveCamera; pal: Palette;
  W: number; H: number;
  /** A block lying on the table: centre, size on the table, height. `z`: how high its underside floats. */
  box(x: number, y: number, w: number, h: number, depth: number, color: string, o?: Shape): void;
  /** A ball resting on the table (or floating `z` above it). */
  ball(x: number, y: number, r: number, color: string, z?: number): void;
  /** A flat round piece (puck, checker, coin). */
  disc(x: number, y: number, r: number, depth: number, color: string, z?: number): void;
  /** A cone pointing up; `tip` leans it flat so that it points along the table in direction `rot`. */
  cone(x: number, y: number, r: number, height: number, color: string, o?: Shape & { flat?: boolean }): void;
  /** Where a point of the field is on the 2D layer (stage pixels). */
  to2d(x: number, y: number, z?: number): [number, number];
  /** Pixels on the 2D layer per field unit at the table's centre (for sizing texts). */
  scale: number;
  /** Turns the camera around the table (radians); a guest of a duel looks from the other side. */
  spin: number;
  /** Extra lift of the camera's look (0 flat top view … 1 low and dramatic). Default 0.5. */
  tilt: number;
}
export interface Game3 {
  step?(dt: number): void;
  /** Says what is on the table this frame. */
  render(w: World, t: number, dt: number): void;
  /** Draws texts and particles over the 3D picture (stage pixels). */
  hud?(g: G, w: World, t: number): void;
  pointer?(p: Pointer): void;
  tap?(x: number, y: number): void;
  swipe?(dir: Dir): void;
  key?(code: string, down: boolean): void;
  dispose?(): void;
}

const MAX_DT = 1 / 30, IDLE_MS = 2500, CAP = { box: 3200, ball: 500, disc: 500, cone: 160 };
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function WorldStage({ api, size, init, table = true }: {
  api: GameApi; size: [number, number]; init: (w: World) => Game3; table?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const initRef = useRef(init);
  useEffect(() => {
    const el = box.current!;
    let dead = false, cleanup = () => {};
    void import('three').then((THREE) => {
      if (dead) return;
      let renderer: T.WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { api.end(0); return; }
      const [FW, FH] = size;
      const soft = !api.phone; // soft shadows on computers; phones keep the frame rate
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, api.phone ? 1.5 : 2));
      renderer.shadowMap.enabled = soft;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = 'absolute inset-0 block h-full w-full touch-none';
      el.appendChild(renderer.domElement);
      const overlay = document.createElement('canvas');
      overlay.className = 'pointer-events-none absolute inset-0 block h-full w-full';
      el.appendChild(overlay);
      const g = overlay.getContext('2d')!;

      const scene = new THREE.Scene();
      let pal = theme.get();
      const bg = new THREE.Color(pal.bg1);
      scene.background = bg;
      const camera = new THREE.PerspectiveCamera(34, 1, 1, 6000);
      const hemi = new THREE.HemisphereLight(0xffffff, 0xb9a8d8, 1.7);
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      const span = Math.max(FW, FH);
      sun.position.set(-span * 0.35, span * 1.2, span * 0.45);
      sun.castShadow = soft;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -span * 0.75, right: span * 0.75, top: span * 0.75, bottom: -span * 0.75, near: 1, far: span * 4 });
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
      scene.add(hemi, sun, sun.target);
      // The table everything stands on.
      const tableMat = new THREE.MeshLambertMaterial({ color: pal.paper2 });
      if (table) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(FW + span * 0.12, span * 0.06, FH + span * 0.12), tableMat);
        top.position.y = -span * 0.03 - 0.2;
        top.receiveShadow = true;
        scene.add(top);
      }
      // One instanced mesh per kind of shape.
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const geos = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(1, 20, 14), disc: new THREE.CylinderGeometry(1, 1, 1, 28), cone: new THREE.ConeGeometry(1, 1, 16) };
      const meshes = Object.fromEntries((Object.keys(geos) as (keyof typeof geos)[]).map((k) => {
        const m = new THREE.InstancedMesh(geos[k], mat, CAP[k]);
        m.castShadow = soft; m.receiveShadow = soft; m.frustumCulled = false; m.count = 0;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.setColorAt(0, new THREE.Color(1, 1, 1));
        scene.add(m);
        return [k, m];
      })) as unknown as Record<keyof typeof geos, T.InstancedMesh>;
      const used = { box: 0, ball: 0, disc: 0, cone: 0 };
      const dummy = new THREE.Object3D(), colors = new Map<string, T.Color>();
      const colorOf = (c: string) => { let v = colors.get(c); if (!v) { v = new THREE.Color(c); if (colors.size < 600) colors.set(c, v); } return v; };
      const put = (kind: keyof typeof geos, color: string) => {
        const i = used[kind];
        if (i >= CAP[kind]) return;
        dummy.updateMatrix();
        meshes[kind].setMatrixAt(i, dummy.matrix);
        meshes[kind].setColorAt(i, colorOf(color));
        used[kind] = i + 1;
      };
      const v3 = new THREE.Vector3();
      const dim = { w: 1, h: 1 };
      const world: World = {
        THREE, scene, camera, pal, W: FW, H: FH, scale: 1, spin: 0, tilt: 0.5,
        box(x, y, w, h, depth, color, o) {
          dummy.position.set(x - FW / 2, (o?.z ?? 0) + depth / 2, y - FH / 2); dummy.rotation.set(0, -(o?.rot ?? 0), 0); dummy.scale.set(w, depth, h);
          put('box', color);
        },
        ball(x, y, r, color, z = 0) { dummy.position.set(x - FW / 2, z + r, y - FH / 2); dummy.rotation.set(0, 0, 0); dummy.scale.set(r, r, r); put('ball', color); },
        disc(x, y, r, depth, color, z = 0) { dummy.position.set(x - FW / 2, z + depth / 2, y - FH / 2); dummy.rotation.set(0, 0, 0); dummy.scale.set(r, depth, r); put('disc', color); },
        cone(x, y, r, height, color, o) {
          if (o?.flat) { dummy.position.set(x - FW / 2, (o.z ?? 0) + r, y - FH / 2); dummy.rotation.set(0, -(o.rot ?? 0), -Math.PI / 2, 'YXZ'); }
          else { dummy.position.set(x - FW / 2, (o?.z ?? 0) + height / 2, y - FH / 2); dummy.rotation.set(0, 0, 0); }
          dummy.scale.set(r, height, r);
          put('cone', color);
        },
        to2d(x, y, z = 0) { v3.set(x - FW / 2, z, y - FH / 2).project(camera); return [(v3.x * 0.5 + 0.5) * dim.w, (-v3.y * 0.5 + 0.5) * dim.h]; },
      };
      const game = initRef.current(world);

      // The camera looks down at the table from the player's side and stands just far enough to show all of it.
      let lastFit = '';
      const frame = () => {
        const key = `${dim.w}x${dim.h}:${world.spin.toFixed(3)}:${world.tilt.toFixed(2)}`;
        if (key === lastFit) return;
        lastFit = key;
        const elev = 1.18 - world.tilt * 0.5, dir = new THREE.Vector3(Math.sin(world.spin) * Math.cos(elev), Math.sin(elev), Math.cos(world.spin) * Math.cos(elev));
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3((sx * FW * 1.07) / 2, 0, (sz * FH * 1.07) / 2));
        const fits = (dist: number) => {
          camera.position.copy(dir).multiplyScalar(dist); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
          return corners.every((c) => { v3.copy(c).project(camera); return Math.abs(v3.x) < 0.93 && Math.abs(v3.y) < 0.9; });
        };
        let lo = span * 0.4, hi = span * 12;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
        fits(hi);
        const a = world.to2d(FW / 2 - 0.5, FH / 2), b = world.to2d(FW / 2 + 0.5, FH / 2);
        world.scale = Math.hypot(b[0] - a[0], b[1] - a[1]);
      };
      let dpr = 1, dirty = true;
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        dim.w = w; dim.h = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
        lastFit = ''; dirty = true;
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      let raf = 0, last = performance.now(), idleSince = 0;
      const start = last;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
        last = now;
        if (api.running()) { idleSince = now; game.step?.(dt); }
        else if (now - idleSince > IDLE_MS && !dirty) return;
        dirty = false;
        if (theme.get() !== pal) { pal = theme.get(); world.pal = pal; bg.set(pal.bg1); tableMat.color.set(pal.paper2); }
        hemi.intensity = pal.neon ? 1.1 : pal.dark ? 1.35 : 1.7; sun.intensity = pal.neon ? 1.9 : 1.5;
        frame();
        used.box = used.ball = used.disc = used.cone = 0;
        const t = (now - start) / 1000;
        game.render(world, t, dt);
        for (const k of Object.keys(meshes) as (keyof typeof geos)[]) {
          const m = meshes[k];
          m.count = used[k]; m.instanceMatrix.needsUpdate = true;
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
        renderer.render(scene, camera);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, dim.w, dim.h);
        game.hud?.(g, world, t);
      };
      raf = requestAnimationFrame(loop);

      // Input: the pointer's place on the table, taps, swipes and keys.
      const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
      const toField = (cx: number, cy: number): [number, number] => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        return ray.ray.intersectPlane(ground, hit) ? [hit.x + FW / 2, hit.z + FH / 2] : [FW / 2, FH / 2];
      };
      const strokes = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
      const dom = renderer.domElement;
      const down = (e: PointerEvent) => {
        if (e.button > 0) return;
        e.preventDefault();
        try { dom.setPointerCapture(e.pointerId); } catch { /* already released */ }
        const [x, y] = toField(e.clientX, e.clientY);
        strokes.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
        game.pointer?.({ type: 'down', x, y, id: e.pointerId });
      };
      const move = (e: PointerEvent) => {
        const [x, y] = toField(e.clientX, e.clientY);
        game.pointer?.({ type: 'move', x, y, id: e.pointerId });
        const s = strokes.get(e.pointerId);
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
        s.x = e.clientX; s.y = e.clientY; s.moved = true;
        game.swipe?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      };
      const up = (e: PointerEvent) => {
        const [x, y] = toField(e.clientX, e.clientY);
        const s = strokes.get(e.pointerId);
        strokes.delete(e.pointerId);
        game.pointer?.({ type: 'up', x, y, id: e.pointerId });
        if (s && !s.moved && e.type === 'pointerup' && performance.now() - s.t < 600) game.tap?.(x, y);
      };
      const key = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
        if (GAME_KEYS.has(e.code)) e.preventDefault();
        if (e.type === 'keydown' && e.repeat) return;
        game.key?.(e.code, e.type === 'keydown');
      };
      const menu = (e: Event) => e.preventDefault();
      dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up); dom.addEventListener('contextmenu', menu);
      window.addEventListener('keydown', key); window.addEventListener('keyup', key);

      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect();
        window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
        game.dispose?.();
        scene.traverse((o) => {
          const m = o as T.Mesh;
          m.geometry?.dispose?.();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          for (const x of mats) { (x as T.MeshBasicMaterial).map?.dispose?.(); x.dispose?.(); }
        });
        for (const m of Object.values(meshes)) m.dispose();
        renderer.dispose(); renderer.forceContextLoss();
        dom.remove(); overlay.remove();
      };
    });
    return () => { dead = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={box} className="absolute inset-x-0 top-0 bottom-2 overflow-hidden rounded-2xl border-2 border-[var(--a-edge)] shadow-[0_6px_0_var(--a-edge)]" />;
}
