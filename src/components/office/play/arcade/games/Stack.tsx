'use client';
import { ThreeStage, type ThreeCtx } from '../kit/Stage';
import type { Game3D, GameApi } from '../kit/types';
import { theme } from '../kit/theme';
import { rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Sky Stack (3D). A block slides back and forth above the tower; a tap drops it. Whatever hangs over the
// block below is cut off and falls, so the next block is smaller. A drop that lines up (almost) exactly
// cuts nothing and scores a bonus point; three of those in a row make the block grow again. Missing the
// tower ends the round. The score is the number of blocks placed plus the bonus points.

const BH = 0.55, BASE = 3.2, RANGE = 4.4, PERFECT = 0.13;
interface Block { x: number; z: number; w: number; d: number }

export default function Stack({ api }: { api: GameApi }) {
  return <ThreeStage api={api} fov={40} init={create} />;
}

function create({ THREE, scene, camera, api }: ThreeCtx): Game3D {
  const r = rng(api.seed);
  let pal = theme.get();
  const bg = new THREE.Color(pal.bg1);
  scene.background = bg;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a8d8, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(5, 12, 7);
  scene.add(sun);
  const box = new THREE.BoxGeometry(1, 1, 1), edges = new THREE.EdgesGeometry(box);
  const ink = new THREE.LineBasicMaterial({ color: pal.ink });
  const hue0 = r();
  const make = (b: Block, y: number, i: number, h = BH) => {
    const m = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL((hue0 + i * 0.035) % 1, 0.72, 0.62, THREE.SRGBColorSpace) }));
    m.add(new THREE.LineSegments(edges, ink));
    m.scale.set(b.w, h, b.d); m.position.set(b.x, y, b.z);
    scene.add(m);
    return m;
  };
  // A tall pedestal, so the tower stands on something.
  const tower: Block[] = [{ x: 0, z: 0, w: BASE, d: BASE }];
  make(tower[0], -4 + BH / 2, 0, 8);
  // Soft clouds drifting behind the tower.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: pal.dark ? 0.08 : 0.55 });
  const clouds = Array.from({ length: 9 }, (_, i) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cloudMat);
    c.scale.set(2 + r() * 2.5, 0.7 + r() * 0.5, 1);
    c.position.set(-9 + r() * 6 - i * 0.4, i * 4 - 2 + r() * 2, -9 + r() * 6);
    scene.add(c);
    return c;
  });
  const debris: { m: import('three').Mesh; vy: number; vx: number; vz: number; spin: number }[] = [];
  const flash = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  scene.add(flash);

  let level = 1, mover: import('three').Mesh | null = null, cur: Block = { ...tower[0] }, t = 0, combo = 0, bonus = 0, over = 0, ended = false, camY = 0, zoom = 0;
  const top = () => (tower.length - 1) * BH + BH; // y of the top face
  const axis = () => (level % 2 ? 'x' : 'z') as 'x' | 'z';
  const spawn = () => {
    const last = tower[tower.length - 1];
    cur = { ...last };
    t = 0;
    mover = make(cur, top() + BH / 2, level);
  };
  spawn();
  const pos = () => { const span = RANGE * 2, speed = 3.1 + Math.min(3.6, level * 0.07), u = (t * speed) % (span * 2); return -RANGE + (u < span ? u : span * 2 - u); };

  const drop = () => {
    if (!mover || over || !api.running()) return;
    const last = tower[tower.length - 1], a = axis();
    const delta = cur[a] - last[a], size = a === 'x' ? last.w : last.d, overlap = size - Math.abs(delta);
    if (overlap <= 0.04) {
      // Missed: the whole block falls.
      debris.push({ m: mover, vy: 0, vx: a === 'x' ? Math.sign(delta) * 1.5 : 0, vz: a === 'z' ? Math.sign(delta) * 1.5 : 0, spin: 2 });
      mover = null; over = 0.0001;
      sfx.boom(); buzz(80);
      return;
    }
    let placed: Block;
    if (Math.abs(delta) < PERFECT) {
      combo++; bonus++;
      placed = { ...last };
      if (combo >= 3) { placed.w = Math.min(BASE, placed.w + 0.22); placed.d = Math.min(BASE, placed.d + 0.22); }
      flash.scale.set(placed.w + 0.5, 0.06, placed.d + 0.5); flash.position.set(placed.x, top() + 0.02, placed.z);
      (flash.material as import('three').MeshBasicMaterial).opacity = 0.85;
      sfx.point(combo * 2 + 4); buzz(15);
    } else {
      combo = 0;
      placed = { ...last };
      placed[a] = last[a] + delta / 2;
      if (a === 'x') placed.w = overlap; else placed.d = overlap;
      // The part that hangs over falls off.
      const cut: Block = { ...placed };
      const cutSize = Math.abs(delta);
      cut[a] = placed[a] + Math.sign(delta) * (overlap / 2 + cutSize / 2);
      if (a === 'x') cut.w = cutSize; else cut.d = cutSize;
      const piece = make(cut, top() + BH / 2, level);
      debris.push({ m: piece, vy: 0, vx: a === 'x' ? Math.sign(delta) * 1.2 : 0, vz: a === 'z' ? Math.sign(delta) * 1.2 : 0, spin: 1.5 + r() * 2 });
      sfx.place();
    }
    mover.scale.set(placed.w, BH, placed.d); mover.position.set(placed.x, top() + BH / 2, placed.z);
    tower.push(placed);
    level++;
    api.score(tower.length - 1 + bonus);
    api.hud(combo > 1 ? api.t('perfect', { n: combo }) : null);
    spawn();
  };

  return {
    step(dt) {
      if (over) { over += dt; if (over > 1.6 && !ended) { ended = true; api.end(tower.length - 1 + bonus); } return; }
      t += dt;
      if (mover) { cur[axis()] = pos(); mover.position[axis()] = cur[axis()]; }
    },
    frame(dt, time) {
      if (theme.get() !== pal) { pal = theme.get(); bg.set(pal.bg1); ink.color.set(pal.ink); cloudMat.opacity = pal.dark ? 0.08 : 0.55; }
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.vy -= 16 * dt;
        d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
        d.m.rotation.x += d.spin * dt * (d.vz ? 1 : 0.2); d.m.rotation.z -= d.spin * dt * (d.vx ? 1 : 0.2);
        if (d.m.position.y < camY - 14) { scene.remove(d.m); (d.m.material as import('three').Material).dispose(); debris.splice(i, 1); }
      }
      const fm = flash.material as import('three').MeshBasicMaterial;
      if (fm.opacity > 0) { fm.opacity = Math.max(0, fm.opacity - dt * 2.4); flash.scale.x += dt * 2.5; flash.scale.z += dt * 2.5; }
      clouds.forEach((c, i) => { c.position.x += dt * (0.12 + (i % 3) * 0.05); if (c.position.x > 4) c.position.x = -14; c.position.y += Math.sin(time * 0.4 + i) * dt * 0.05; });
      // The camera climbs with the tower; at the end it steps back to show all of it.
      camY += (top() - camY) * Math.min(1, dt * 3);
      zoom += ((over ? Math.min(2.2, tower.length * 0.06) : 0) - zoom) * Math.min(1, dt * 2);
      const dist = 8.6 * (1 + zoom);
      camera.position.set(dist, camY + 7.4 - zoom * 2.5, dist);
      camera.lookAt(0, camY - zoom * camY * 0.3, 0);
    },
    resize(w, h) { camera.fov = w / h < 0.8 ? 54 : 40; camera.updateProjectionMatrix(); },
    tap: drop,
    key(code, down) { if (down && (code === 'Space' || code === 'ArrowDown' || code === 'Enter')) drop(); },
  };
}
