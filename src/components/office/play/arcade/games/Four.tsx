'use client';
import { ThreeStage, type ThreeCtx } from '../kit/Stage';
import type { Game3D } from '../kit/types';
import { useBoard } from '../kit/board';
import { theme } from '../kit/theme';
import { sfx } from '../kit/sfx';
import type { BoardProps } from '../rules/types';
import { COLS, ROWS, landing, type FourMove, type FourState } from '../rules/four';

export { rules } from '../rules/four';

// Four in a Row in 3D: a standing rack, discs that drop in from above and bounce, a ghost disc over the
// column under the pointer, and the winning four that pulse.

type Props = BoardProps<FourState, FourMove>;

export default function Four(props: Props) {
  const { api, get } = useBoard(props);
  return <ThreeStage api={api} fov={40} init={(ctx) => create(ctx, get)} />;
}

function create({ THREE, scene, camera, size }: ThreeCtx, get: () => Props): Game3D {
  let pal = theme.get();
  const bg = new THREE.Color(pal.bg1);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a8d8, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(3, 8, 9);
  scene.add(sun);
  const cx = (c: number) => c - (COLS - 1) / 2, cy = (r: number) => ROWS - 1 - r + 0.5;
  // The rack: a back plate, a ring around every hole, a foot.
  const rackMat = new THREE.MeshLambertMaterial({ color: pal.sky });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.5, ROWS + 0.5, 0.2), rackMat);
  plate.position.set(0, ROWS / 2, -0.32);
  scene.add(plate);
  const ringGeo = new THREE.TorusGeometry(0.44, 0.07, 10, 28), ringMat = new THREE.MeshLambertMaterial({ color: pal.dark ? '#2b4f8a' : '#2f86d9' });
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(cx(c), cy(r), 0.02); scene.add(ring); }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: pal.dark ? '#1b1838' : '#1d5fa3' }));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const h = hole.clone(); h.position.set(cx(c), cy(r), -0.21); scene.add(h); }
  const foot = new THREE.Mesh(new THREE.BoxGeometry(COLS + 1.4, 0.3, 1.6), rackMat);
  foot.position.set(0, -0.4, -0.2);
  scene.add(foot);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.55;
  scene.add(floor);

  const discGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.18, 28);
  discGeo.rotateX(Math.PI / 2);
  const mats = [0, 1].map((i) => new THREE.MeshLambertMaterial({ color: get().colors[i] }));
  const discs = new Map<number, { m: import('three').Mesh; y: number; vy: number; rest: number; settled: boolean }>();
  const ghost = new THREE.Mesh(discGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  ghost.visible = false;
  scene.add(ghost);
  let hover = -1, seen: FourState | null = null;

  const sync = (s: FourState, drop: boolean) => {
    for (const [i, d] of discs) if (!s.b[i]) { scene.remove(d.m); discs.delete(i); }
    s.b.forEach((v, i) => {
      if (!v || discs.has(i)) return;
      const m = new THREE.Mesh(discGeo, mats[v - 1]);
      const rest = cy(Math.floor(i / COLS)), y = drop ? ROWS + 1.2 : rest;
      m.position.set(cx(i % COLS), y, 0);
      scene.add(m);
      discs.set(i, { m, y, vy: 0, rest, settled: !drop });
    });
  };
  const column = (px: number, py: number) => {
    // The pointer's column, found where its ray crosses the board's plane.
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / size.w) * 2 - 1, -(py / size.h) * 2 + 1), camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
    if (!hit) return -1;
    const c = Math.round(hit.x + (COLS - 1) / 2);
    return c >= 0 && c < COLS && hit.y > -1 && hit.y < ROWS + 2.5 ? c : -1;
  };
  const play = (c: number) => { const { s, canMove, move } = get(); if (canMove && c >= 0 && landing(s.b, c) >= 0) move(c); else if (canMove && c >= 0) sfx.bad(); };

  return {
    frame(dt, time) {
      if (theme.get() !== pal) { pal = theme.get(); bg.set(pal.bg1); rackMat.color.set(pal.sky); }
      const { s, canMove, seat, colors } = get();
      if (s !== seen) { sync(s, seen !== null); seen = s; mats.forEach((m, i) => m.color.set(colors[i])); }
      for (const [i, d] of discs) {
        if (!d.settled) {
          d.vy -= 34 * dt; d.y += d.vy * dt;
          if (d.y <= d.rest) { d.y = d.rest; if (Math.abs(d.vy) > 3) { d.vy = -d.vy * 0.32; sfx.place(); } else { d.vy = 0; d.settled = true; } }
        }
        const win = s.line?.includes(i);
        d.m.position.y = d.y;
        d.m.scale.setScalar(win ? 1 + Math.sin(time * 9) * 0.1 : 1);
        d.m.position.z = win ? 0.12 : 0;
      }
      ghost.visible = canMove && hover >= 0 && landing(s.b, hover) >= 0;
      if (ghost.visible) { ghost.position.set(cx(hover), ROWS + 0.55 + Math.sin(time * 5) * 0.08, 0); (ghost.material as import('three').MeshLambertMaterial).color.set(colors[seat]); }
      // A gentle sway, so the rack reads as a thing in space.
      const a = Math.sin(time * 0.5) * 0.12;
      const dist = size.w / size.h < 0.9 ? 15.5 : 11.5;
      camera.position.set(Math.sin(a) * dist, ROWS / 2 + 1.4, Math.cos(a) * dist);
      camera.lookAt(0, ROWS / 2 + 0.2, 0);
    },
    pointer(p) { if (p.type !== 'up') hover = column(p.x, p.y); },
    tap(x, y) { play(column(x, y)); },
    key(code, down) { if (down && /^(Digit|Numpad)[1-7]$/.test(code)) play(Number(code.slice(-1)) - 1); },
  };
}
