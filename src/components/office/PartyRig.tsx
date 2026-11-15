'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CONF_RADIUS, WALL_HEIGHT } from './layout';
import { party, partyPhase, partyNow, type PartyLights } from './party';
import { partyAudio, type Levels } from './partyAudio';

// The party rig of the conference room, shown once the table and chairs are up in the ceiling: a mirror
// ball that comes down from the middle of the closed hatch and throws moving dots on the walls, the floor
// and the ceiling; six moving heads with coloured beams and spots on the floor; two laser fans; an LED
// dance floor; coloured lights and a strobe. All of it follows the music playing on this device (bass,
// middle, treble and beats, see partyAudio.ts) and the light settings everyone shares. Real lights are
// few (two coloured ones, one strobe); beams, spots, dots and the floor are glowing shapes.

const HEADS = 6, HEAD_R = 3.05, DOTS = 150, LASERS = 2, LASER_FAN = 7;
const BALL_Y = WALL_HEIGHT - 0.85, BALL_R = 0.27;
const FLOOR_R = CONF_RADIUS - 0.06, TILES = 18;

const glow = (color = '#ffffff', opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

// A soft round spot (floor spots and the dots of the mirror ball).
function softDot(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!, r = size / 2, grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
// Beam: bright at the lamp, fading along its length and towards its edges.
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!, v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(255,255,255,0.05)'); v.addColorStop(0.7, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = v; g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0.2)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = h; g.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
}

interface Look { hue: (i: number) => number; sat: number; power: (i: number) => number; motion: number; flash: number }
// What the lights do this frame, from the mode, the music and the time.
function look(l: PartyLights, lv: Levels, t: number, beats: number): Look {
  const speed = 0.25 + (l.speed / 100) * 1.75, intensity = l.intensity / 100;
  const pulse = lv.playing ? Math.exp(-(performance.now() / 1000 - lv.beat) * 5.5) : 0.5 + 0.5 * Math.sin(t * 2 * speed);
  const music = lv.playing ? 0.55 + 0.45 * Math.min(1, lv.level * 2.2) : 0.75;
  const strobeOn = (l.strobe || l.mode === 'strobe') && (lv.playing ? pulse > 0.6 : Math.sin(t * Math.PI * 2 * (3 + speed * 4)) > 0.85);
  switch (l.mode) {
    case 'rainbow': return { hue: (i) => (t * 0.08 * speed + i / HEADS) % 1, sat: 0.9, power: () => intensity * music, motion: speed, flash: strobeOn ? 1 : 0 };
    case 'chase': return { hue: () => (Math.floor(t * speed * 1.5) * 0.17) % 1, sat: 1, power: (i) => intensity * (0.15 + 0.85 * (Math.floor(t * speed * 6) % HEADS === i ? 1 : 0.15)), motion: speed * 0.6, flash: strobeOn ? 1 : 0 };
    case 'calm': return { hue: (i) => (0.55 + 0.15 * Math.sin(t * 0.12 * speed + i)) % 1, sat: 0.55, power: () => intensity * 0.55, motion: speed * 0.3, flash: 0 };
    case 'strobe': return { hue: () => 0, sat: 0, power: () => intensity * (strobeOn ? 1 : 0.06), motion: speed * 0.4, flash: strobeOn ? 1 : 0 };
    default: return { hue: (i) => ((beats * 0.137) + i * 0.08) % 1, sat: 1, power: () => intensity * (0.3 + 0.7 * pulse), motion: speed * (0.6 + pulse * 0.8), flash: strobeOn ? 1 : 0 };
  }
}

export function PartyRig({ low }: { low: boolean }) {
  const root = useRef<THREE.Group>(null);
  const made = useMemo(() => {
    const dot = softDot(), beamTex = beamTexture();
    const g = new THREE.Group();
    // Mirror ball on its rod.
    const ballG = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({ color: '#e8eef5', metalness: 1, roughness: 0.12, flatShading: true, envMapIntensity: 2.2, emissive: '#ffffff', emissiveIntensity: 0.18 });
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL_R, 3), ballMat);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2a2a30', metalness: 0.6, roughness: 0.4 }));
    ballG.add(ball, rod);
    // Dots thrown by the ball: one instanced mesh, placed where each ray meets the room every frame.
    const dotMat = new THREE.MeshBasicMaterial({ map: dot, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const dots = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dotMat, DOTS);
    dots.frustumCulled = false;
    dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const rays = Array.from({ length: DOTS }, (_, i) => {
      // Spread over the sphere (golden spiral), a little random.
      const y = 1 - (i + 0.5) / DOTS * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996 + (i % 7) * 0.05;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
    for (let i = 0; i < DOTS; i++) dots.setColorAt(i, new THREE.Color('#ffffff'));
    // Moving heads, their beams and the spots where the beams land.
    const headMat = new THREE.MeshStandardMaterial({ color: '#1b1c22', metalness: 0.5, roughness: 0.35 });
    const lensMats: THREE.MeshBasicMaterial[] = [], beamMats: THREE.MeshBasicMaterial[] = [], spotMats: THREE.MeshBasicMaterial[] = [];
    const heads = Array.from({ length: HEADS }, (_, i) => {
      const a = (i / HEADS) * Math.PI * 2 + Math.PI / HEADS;
      const mount = new THREE.Group();
      mount.position.set(Math.sin(a) * HEAD_R, WALL_HEIGHT, Math.cos(a) * HEAD_R);
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), headMat); yoke.position.y = -0.06;
      const aim = new THREE.Group(); aim.position.y = -0.2; // turns to point the beam
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 16), headMat);
      const lensMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }); lensMats.push(lensMat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 20).rotateX(Math.PI / 2), lensMat); lens.position.y = -0.131;
      const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffffff', transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); beamMats.push(beamMat);
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.4, 20, 1, true).translate(0, -1.7, 0), beamMat); beam.position.y = -0.13;
      aim.add(body, lens, beam);
      mount.add(yoke, aim);
      const spotMat = new THREE.MeshBasicMaterial({ map: dot, color: '#ffffff', transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }); spotMats.push(spotMat);
      const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2), spotMat);
      g.add(mount, spot);
      return { mount, aim, spot, a };
    });
    // Laser fans from two sides near the ceiling.
    const laserMats: THREE.MeshBasicMaterial[] = [];
    const lasers = Array.from({ length: LASERS }, (_, k) => {
      const a = k * Math.PI + Math.PI / 2;
      const em = new THREE.Group(); em.position.set(Math.sin(a) * (CONF_RADIUS - 0.35), WALL_HEIGHT - 0.25, Math.cos(a) * (CONF_RADIUS - 0.35));
      const fan = new THREE.Group(); em.add(fan);
      for (let j = 0; j < LASER_FAN; j++) {
        const m = glow('#22ff66', 0.9); laserMats.push(m);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 4.4).translate(0, 0, 2.2), m);
        line.rotation.y = (j - (LASER_FAN - 1) / 2) * 0.16;
        fan.add(line);
      }
      g.add(em);
      return { em, fan, a };
    });
    // LED dance floor: tiles painted on a small canvas each frame.
    const floorCv = document.createElement('canvas'); floorCv.width = floorCv.height = TILES * 8;
    const floorTex = new THREE.CanvasTexture(floorCv); floorTex.magFilter = THREE.NearestFilter; floorTex.minFilter = THREE.LinearFilter; floorTex.colorSpace = THREE.SRGBColorSpace;
    const floorMat = new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 72).rotateX(-Math.PI / 2), floorMat); floor.position.y = 0.012;
    g.add(ballG, dots, floor);
    return { g, ballG, ball, rod, ballMat, dots, dotMat, rays, heads, lensMats, beamMats, spotMats, lasers, laserMats, floor, floorCv, floorTex, floorMat, dot, beamTex, headMat };
  }, []);
  useEffect(() => () => {
    made.g.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
    [made.ballMat, made.dotMat, made.floorMat, made.headMat, ...made.lensMats, ...made.beamMats, ...made.spotMats, ...made.laserMats].forEach((m) => m.dispose());
    [made.dot, made.beamTex, made.floorTex].forEach((t) => t.dispose());
  }, [made]);

  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const strobe = useRef<THREE.PointLight>(null);
  const beatCount = useRef({ last: -1, n: 0, targets: Array.from({ length: HEADS }, () => [0, 0.5]) as number[][] });
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() }), []);
  const floorPaint = useRef(0);

  useFrame((state, dt) => {
    const s = party.get(), ph = partyPhase(s, partyNow()), k = ph.rig;
    const g = root.current;
    if (!g) return;
    g.visible = k > 0;
    lights.current.forEach((l) => { if (l) l.intensity = 0; });
    if (strobe.current) strobe.current.intensity = 0;
    if (!k) return;
    const l = s.lights, t = state.clock.elapsedTime, lv = partyAudio.levels();
    const bc = beatCount.current;
    if (lv.beat !== bc.last) {
      bc.last = lv.beat; bc.n++;
      // On a beat the heads jump to new places (beat mode).
      bc.targets = bc.targets.map(() => [Math.random() * Math.PI * 2, 0.25 + Math.random() * 0.55]);
    }
    const lk = look(l, lv, t, bc.n);
    const ease = 1 - (1 - k) ** 3;

    // Mirror ball: comes down from the ceiling, turns, throws its dots.
    made.ballG.visible = l.ball;
    const by = WALL_HEIGHT + 0.3 - (WALL_HEIGHT + 0.3 - BALL_Y) * ease;
    made.ballG.position.set(0, by, 0);
    made.rod.scale.y = Math.max(0.01, WALL_HEIGHT - by);
    made.ball.rotation.y += dt * (0.35 + lk.motion * 0.25);
    made.dots.visible = l.ball && k > 0.6;
    if (made.dots.visible) {
      const spin = made.ball.rotation.y, cs = Math.cos(spin), sn = Math.sin(spin);
      const bright = Math.min(1, (l.intensity / 100) * (lv.playing ? 0.6 + lv.high * 1.4 : 0.8)) * (k - 0.6) / 0.4;
      for (let i = 0; i < DOTS; i++) {
        const r = made.rays[i];
        tmp.d.set(r.x * cs - r.z * sn, r.y, r.x * sn + r.z * cs);
        // Where the ray meets the room: floor, ceiling or the round wall.
        const dx = tmp.d.x, dy = tmp.d.y, dz = tmp.d.z, a = dx * dx + dz * dz;
        let tw = Infinity;
        if (a > 1e-6) tw = Math.sqrt((CONF_RADIUS - 0.1) ** 2 / a); // centre is the room's middle
        const tf = dy < 0 ? (0.015 - by) / dy : Infinity, tc = dy > 0 ? (WALL_HEIGHT - 0.03 - by) / dy : Infinity;
        const hit = Math.min(tw, tf, tc);
        tmp.p.set(dx * hit, by + dy * hit, dz * hit);
        if (hit === tf) tmp.n.set(0, 1, 0); else if (hit === tc) tmp.n.set(0, -1, 0); else tmp.n.set(-tmp.p.x, 0, -tmp.p.z).normalize();
        tmp.q.setFromUnitVectors(tmp.s.set(0, 0, 1), tmp.n);
        const size = 0.05 + 0.025 * hit;
        tmp.m.compose(tmp.p, tmp.q, tmp.s.set(size, size, 1));
        made.dots.setMatrixAt(i, tmp.m);
        tmp.c.setHSL(l.color ? (lk.hue(i % HEADS) + i * 0.01) % 1 : 0, l.color ? 0.35 : 0, 0.6 * bright);
        made.dots.setColorAt(i, tmp.c);
      }
      made.dots.instanceMatrix.needsUpdate = true;
      if (made.dots.instanceColor) made.dots.instanceColor.needsUpdate = true;
    }

    // Moving heads.
    made.heads.forEach((h, i) => {
      h.mount.visible = l.heads;
      h.spot.visible = l.heads && k > 0.5;
      if (!l.heads) return;
      h.mount.scale.setScalar(Math.max(0.01, ease));
      h.mount.position.y = WALL_HEIGHT + 0.25 * (1 - ease);
      let pan: number, tilt: number;
      if (l.mode === 'beat' && lv.playing) {
        const [tp, tt] = bc.targets[i];
        pan = h.aim.userData.pan ?? tp; tilt = h.aim.userData.tilt ?? tt;
        const f = 1 - Math.exp(-dt * 7);
        pan += Math.atan2(Math.sin(tp - pan), Math.cos(tp - pan)) * f; tilt += (tt - tilt) * f;
      } else {
        pan = h.a + Math.PI + Math.sin(t * 0.7 * lk.motion + i * 1.3) * 1.1;
        tilt = 0.45 + 0.3 * Math.sin(t * 0.9 * lk.motion + i * 0.7);
      }
      h.aim.userData.pan = pan; h.aim.userData.tilt = tilt;
      h.aim.rotation.set(0, 0, 0);
      tmp.e.set(tilt * Math.cos(pan), 0, tilt * Math.sin(pan));
      h.aim.rotation.copy(tmp.e);
      const hue = lk.hue(i), pw = Math.max(0, lk.power(i)) * ease;
      tmp.c.setHSL(l.color ? hue : 0, l.color ? lk.sat : 0, 0.55);
      made.beamMats[i].color.copy(tmp.c); made.beamMats[i].opacity = 0.42 * pw;
      made.lensMats[i].color.copy(tmp.c).multiplyScalar(0.4 + 1.6 * pw);
      made.spotMats[i].color.copy(tmp.c).multiplyScalar(pw * 1.2);
      // Spot on the floor where the beam lands.
      h.aim.updateWorldMatrix(true, false);
      tmp.d.set(0, -1, 0).applyQuaternion(h.aim.getWorldQuaternion(tmp.q));
      h.aim.getWorldPosition(tmp.p);
      if (g.parent) g.parent.worldToLocal(tmp.p);
      const tt = tmp.d.y < -0.05 ? (0.02 - tmp.p.y) / tmp.d.y : 0;
      h.spot.position.set(tmp.p.x + tmp.d.x * tt, 0.02, tmp.p.z + tmp.d.z * tt);
      const sc = 0.6 + tt * 0.12;
      h.spot.scale.set(sc, 1, sc);
    });

    // Lasers.
    made.lasers.forEach((z, j) => {
      z.em.visible = l.lasers && k > 0.7;
      if (!z.em.visible) return;
      z.em.rotation.set(0, z.a + Math.PI + Math.sin(t * 0.8 * lk.motion + j) * 0.7, 0);
      z.fan.rotation.x = 0.18 + 0.16 * Math.sin(t * 1.3 * lk.motion + j * 2);
      const on = lv.playing ? 0.35 + 0.65 * Math.exp(-(performance.now() / 1000 - lv.beat) * 4) : 0.7;
      const hue = l.color ? [0.33, 0.0, 0.6][(bc.n + j) % 3] : 0;
      for (let q = 0; q < LASER_FAN; q++) {
        const m = made.laserMats[j * LASER_FAN + q];
        m.color.setHSL(hue, l.color ? 1 : 0, 0.55);
        m.opacity = (l.intensity / 100) * on * ((q + bc.n) % 2 ? 1 : 0.55);
      }
    });

    // LED floor, painted about thirty times a second.
    made.floor.visible = l.floor && k > 0.3;
    floorPaint.current += dt;
    if (made.floor.visible && floorPaint.current > 1 / 30) {
      floorPaint.current = 0;
      const c = made.floorCv.getContext('2d')!, px = made.floorCv.width / TILES;
      c.fillStyle = '#000'; c.fillRect(0, 0, made.floorCv.width, made.floorCv.height);
      const pulse = lv.playing ? lv.bass : 0.4 + 0.3 * Math.sin(t * 3);
      for (let y = 0; y < TILES; y++) for (let x = 0; x < TILES; x++) {
        const cx = x - TILES / 2 + 0.5, cy = y - TILES / 2 + 0.5, d = Math.hypot(cx, cy);
        let v: number, hue: number;
        if (l.mode === 'chase') { v = (Math.floor(t * 4 * lk.motion) + x + y) % 4 === 0 ? 1 : 0.08; hue = lk.hue(0); }
        else if (l.mode === 'rainbow') { v = 0.55 + 0.45 * Math.sin(d * 0.8 - t * 3 * lk.motion); hue = (lk.hue(0) + d * 0.04) % 1; }
        else if (l.mode === 'calm') { v = 0.25 + 0.2 * Math.sin(x * 0.7 + y * 0.5 + t * lk.motion); hue = lk.hue(0); }
        else { const ring = Math.abs(d - (pulse * TILES * 0.75)); v = Math.max(0.06, 1 - ring * 0.8) * (0.5 + pulse); hue = (lk.hue(0) + Math.floor(d) * 0.07) % 1; }
        if (lk.flash) { v = 1; hue = 0; }
        tmp.c.setHSL(l.color ? hue : 0, l.color && !lk.flash ? 1 : 0, Math.min(0.5, 0.5 * v * (l.intensity / 100)));
        c.fillStyle = `#${tmp.c.getHexString()}`;
        c.fillRect(x * px + 1, y * px + 1, px - 2, px - 2);
      }
      made.floorTex.needsUpdate = true;
    }

    // Real coloured lights and the strobe.
    lights.current.forEach((pl, i) => {
      if (!pl || !l.color) return;
      tmp.c.setHSL(lk.hue(i * 3), lk.sat, 0.55);
      pl.color.copy(tmp.c);
      pl.intensity = 7 * lk.power(i * 3) * ease;
    });
    if (strobe.current) strobe.current.intensity = lk.flash ? 40 * (l.intensity / 100) : 0;
  });

  return (
    <group ref={root} visible={false}>
      <primitive object={made.g} />
      {Array.from({ length: low ? 1 : 2 }, (_, i) => (
        <pointLight key={i} ref={(el) => { lights.current[i] = el; }} position={[i ? -1.6 : 1.6, 2.4, i ? 1.2 : -1.2]} intensity={0} distance={8} decay={1.6} />
      ))}
      <pointLight ref={strobe} position={[0, 2.6, 0]} intensity={0} distance={10} color="#ffffff" />
    </group>
  );
}
