'use client';
import { ThreeStage, type ThreeCtx } from '../kit/Stage';
import type { Dir, Game3D, GameApi } from '../kit/types';
import { theme } from '../kit/theme';
import { rng } from '../kit/rng';
import { buzz, sfx } from '../kit/sfx';

// Sky Sprint (3D). A little round runner on a three-lane road in the clouds; the road comes faster and
// faster. Tall walls must be passed in another lane, low barriers jumped. Coins are worth 10 and a shield
// forgives one crash. The score is the distance in metres plus the coins.

const LANES = [-1.7, 0, 1.7], FAR = -95, GRAVITY = 24, JUMP = 8.2;
type Kind = 'wall' | 'bar' | 'coin' | 'shield';
interface Thing { m: import('three').Object3D; kind: Kind; lane: number; z: number; gone?: boolean }

export default function Runner({ api }: { api: GameApi }) {
  return <ThreeStage api={api} fov={58} init={create} />;
}

function create({ THREE, scene, camera, api }: ThreeCtx): Game3D {
  const r = rng(api.seed);
  let pal = theme.get();
  const bg = new THREE.Color(pal.bg1);
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 45, 92);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9a8d8, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-4, 10, 6);
  scene.add(sun);
  const col = (hex: string) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
  const mats = { road: col(pal.dark ? '#453a75' : '#bfe6da'), stripe: col(pal.sun), wall: col(pal.coral), bar: col(pal.grape), coin: col(pal.sun), shield: col(pal.sky), body: col(pal.mint), white: col('#ffffff'), ink: new THREE.MeshBasicMaterial({ color: pal.ink }), post: col(pal.pink), cloud: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: pal.dark ? 0.1 : 0.7 }) };
  const geo = { box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(1, 20, 14), coin: new THREE.CylinderGeometry(0.34, 0.34, 0.1, 18), cone: new THREE.ConeGeometry(0.5, 1.6, 7) };
  const edges = new THREE.EdgesGeometry(geo.box), line = new THREE.LineBasicMaterial({ color: pal.ink });
  const outlined = (mat: import('three').Material, sx: number, sy: number, sz: number) => { const m = new THREE.Mesh(geo.box, mat); m.add(new THREE.LineSegments(edges, line)); m.scale.set(sx, sy, sz); return m; };

  // Road, lane stripes that scroll, posts and clouds beside it.
  const road = outlined(mats.road, 5.6, 0.4, 130);
  road.position.set(0, -0.2, -45);
  scene.add(road);
  const stripes = Array.from({ length: 22 }, (_, i) => { const s = new THREE.Mesh(geo.box, mats.stripe); s.scale.set(0.09, 0.02, 1.6); scene.add(s); return { m: s, x: i % 2 ? 0.85 : -0.85, z: -Math.floor(i / 2) * 9 }; });
  const posts = Array.from({ length: 14 }, (_, i) => { const p = new THREE.Mesh(geo.cone, mats.post); scene.add(p); return { m: p, x: i % 2 ? 3.6 : -3.6, z: -Math.floor(i / 2) * 14 }; });
  const clouds = Array.from({ length: 10 }, (_, i) => { const c = new THREE.Mesh(geo.ball, mats.cloud); c.scale.set(3 + r() * 3, 1 + r(), 2 + r() * 2); scene.add(c); return { m: c, x: (i % 2 ? 1 : -1) * (8 + r() * 9), y: -3 + r() * 9, z: -r() * 90 }; });

  // The runner: a ball with eyes and a shield bubble.
  const hero = new THREE.Group();
  const body = new THREE.Mesh(geo.ball, mats.body);
  body.scale.setScalar(0.52);
  hero.add(body);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(geo.ball, mats.white); eye.scale.setScalar(0.13); eye.position.set(s * 0.19, 0.16, -0.42); hero.add(eye);
    const pupil = new THREE.Mesh(geo.ball, mats.ink); pupil.scale.setScalar(0.065); pupil.position.set(s * 0.19, 0.17, -0.53); hero.add(pupil);
  }
  const bubble = new THREE.Mesh(geo.ball, new THREE.MeshBasicMaterial({ color: pal.sky, transparent: true, opacity: 0.3 }));
  bubble.scale.setScalar(0.8); bubble.visible = false;
  hero.add(bubble);
  scene.add(hero);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  const things: Thing[] = [];
  let lane = 1, x = 0, y = 0, vy = 0, speed = 10, dist = 0, coins = 0, nextRow = -30, shield = false, dead = 0, ended = false, squash = 0, shake = 0, safeLane = 1;
  const score = () => Math.floor(dist) + coins * 10;

  const add = (kind: Kind, l: number, z: number) => {
    let m: import('three').Object3D;
    if (kind === 'wall') { m = outlined(mats.wall, 1.45, 2.3, 0.7); m.position.y = 1.15; }
    else if (kind === 'bar') { m = outlined(mats.bar, 1.6, 0.6, 0.45); m.position.y = 0.3; }
    else if (kind === 'coin') { m = new THREE.Mesh(geo.coin, mats.coin); m.rotation.x = Math.PI / 2; m.position.y = 0.75; }
    else { m = new THREE.Mesh(geo.ball, mats.shield); m.scale.setScalar(0.36); m.position.y = 0.8; }
    m.position.x = LANES[l]; m.position.z = z;
    scene.add(m);
    things.push({ m, kind, lane: l, z });
  };
  // One row of obstacles. There is always a way through: a free lane next to the last one, or bars to jump.
  const row = (z: number) => {
    const k = r(), hard = Math.min(1, dist / 900);
    if (k < 0.16) { for (let l = 0; l < 3; l++) add('bar', l, z); }
    else {
      safeLane = Math.max(0, Math.min(2, safeLane + (r() < 0.5 ? -1 : 1) * (r() < 0.75 ? 1 : 0)));
      for (let l = 0; l < 3; l++) {
        if (l === safeLane) { if (r() < 0.55) for (let i = 0; i < 3; i++) add('coin', l, z - i * 1.5); else if (r() < 0.05) add('shield', l, z); continue; }
        const q = r();
        if (q < 0.45 + hard * 0.3) add('wall', l, z); else if (q < 0.7 + hard * 0.15) add('bar', l, z);
      }
    }
  };

  // The first rows are already on the road, so the run starts at once.
  for (let z = -34; z > FAR; z -= 15) row(z);
  nextRow = -14;

  const move = (d: -1 | 1) => { if (dead) return; const n = Math.max(0, Math.min(2, lane + d)); if (n !== lane) { lane = n; sfx.tick(); } };
  const jump = () => { if (!dead && y <= 0.001) { vy = JUMP; sfx.move(); } };
  const crash = (t: Thing) => {
    if (shield) {
      shield = false; bubble.visible = false; t.gone = true; scene.remove(t.m);
      shake = 0.25; sfx.hit(); buzz(40);
      return;
    }
    dead = 0.0001; squash = 1; shake = 0.5;
    sfx.boom(); buzz(90);
  };

  return {
    step(dt) {
      if (dead) { dead += dt; if (dead > 1.3 && !ended) { ended = true; api.end(score()); } return; }
      speed = Math.min(25, 10 + dist * 0.012);
      const dz = speed * dt;
      dist += dz;
      api.score(score());
      vy -= GRAVITY * dt; y = Math.max(0, y + vy * dt); if (y === 0 && vy < 0) vy = 0;
      x += (LANES[lane] - x) * Math.min(1, dt * 14);
      nextRow += dz;
      if (nextRow >= 0) { row(FAR); nextRow = -(Math.max(8.5, 15 - dist * 0.004) + r() * 3); }
      for (const t of things) {
        t.z += dz; t.m.position.z = t.z;
        if (t.gone || Math.abs(t.z) > 0.62 || Math.abs(LANES[t.lane] - x) > 0.95) continue;
        if (t.kind === 'coin') { t.gone = true; scene.remove(t.m); coins++; sfx.point(coins % 8); }
        else if (t.kind === 'shield') { t.gone = true; scene.remove(t.m); shield = true; bubble.visible = true; sfx.good(); }
        else if (t.kind === 'wall' || y < 0.55) { crash(t); if (dead) return; }
      }
      for (let i = things.length - 1; i >= 0; i--) if (things[i].z > 8 || things[i].gone) { scene.remove(things[i].m); things.splice(i, 1); }
      for (const s of stripes) { s.z += dz; if (s.z > 8) s.z -= 99; }
      for (const p of posts) { p.z += dz; if (p.z > 8) p.z -= 98; }
      for (const c of clouds) { c.z += dz * 0.5; if (c.z > 10) c.z -= 100; }
    },
    frame(dt, time) {
      if (theme.get() !== pal) { pal = theme.get(); bg.set(pal.bg1); line.color.set(pal.ink); mats.road.color.set(pal.dark ? '#453a75' : '#bfe6da'); mats.cloud.opacity = pal.dark ? 0.1 : 0.7; mats.ink.color.set(pal.ink); }
      squash = Math.max(0, squash - dt * 0.5); shake = Math.max(0, shake - dt);
      const run = dead ? 0 : Math.abs(Math.sin(time * speed * 0.9)) * (y > 0 ? 0 : 0.09);
      hero.position.set(x, 0.52 + y + run, 0);
      hero.scale.set(1 + (dead ? 0.4 : 0), dead ? 0.45 : 1 + vy * 0.012, 1);
      hero.rotation.z = (LANES[lane] - x) * -0.25;
      shadow.position.set(x, 0.011, 0); shadow.scale.setScalar(Math.max(0.4, 1 - y * 0.3));
      for (const t of things) if (t.kind === 'coin') t.m.rotation.z = time * 4; else if (t.kind === 'shield') t.m.position.y = 0.8 + Math.sin(time * 5) * 0.12;
      for (const s of stripes) s.m.position.set(s.x, 0.012, s.z);
      for (const p of posts) p.m.position.set(p.x, 0.8, p.z);
      for (const c of clouds) c.m.position.set(c.x, c.y, c.z);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 0.5 : 0;
      camera.position.set(x * 0.35 + sx, 3.3 + y * 0.25, 6.4);
      camera.lookAt(x * 0.2, 1.1, -7);
    },
    resize(w, h) { camera.fov = w / h < 0.8 ? 78 : 58; camera.updateProjectionMatrix(); },
    swipe(d: Dir) { if (d === 'left') move(-1); else if (d === 'right') move(1); else if (d === 'up') jump(); },
    tap: jump,
    key(code, down) {
      if (!down) return;
      if (code === 'ArrowLeft' || code === 'KeyA') move(-1); else if (code === 'ArrowRight' || code === 'KeyD') move(1);
      else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') jump();
    },
  };
}
