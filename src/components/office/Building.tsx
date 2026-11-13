'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { DOORS, doorAngles, isDoorOpen } from './doors';
import { buildWalls, OFFICES, WALL_HEIGHT, H, OUT, SOUTH, PORCH, CONF_RADIUS, GAME, CAFE, LIBRARY, HALL, guideLines, type DoorDef, type Segment } from './layout';
import { wallWash } from './textures';
import { confGlass } from './conferenceGlass';
import { Batch, batchMaterials } from './batch';
import { LAMPS } from './lighting';

// The shell of the office. Everything that does not move is merged into a few meshes (batch.ts): all solid
// walls are one draw call, all trims, lamps' rims and wall art another, the floor lines and lamp discs a
// third, and the glass is one mesh per office (so its frosting can switch) plus one for the rest.

// Brighter than white, so lamps glow (bloom) in high quality; plain white otherwise.
const LAMP = new THREE.Color(1.5, 1.42, 1.25);
const COLORS = { orange: '#e8743b', teal: '#2f8f8a', cream: '#efe4d2', trim: '#3a3330', glass: '#c9e6e3', wood: '#a8774f', gold: '#d8c28a' };

// Warm stone tiles (1 m) with soft variation and fine grout lines.
function floorTexture() {
  const S = 512, T = S / 4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 9;
  const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const l = 190 + r() * 8;
    g.fillStyle = `rgb(${l},${l - 14},${l - 36})`; g.fillRect(x * T, y * T, T, T);
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${130 + r() * 60},${105 + r() * 50},80,0.05)`; g.fillRect(r() * S, r() * S, 2, 2); }
  g.strokeStyle = 'rgba(120,98,76,0.16)'; g.lineWidth = 2;
  for (let i = 0; i <= S; i += T) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(0 + S, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  // The floor's texture coordinates are metres, so a quarter repeat gives 1 m tiles.
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.25, 0.25); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const footprint = () => {
  const s = new THREE.Shape();
  const pts: [number, number][] = [[-OUT, -OUT], [-H, -OUT], [-H, HALL.min[1]], [H, HALL.min[1]], [H, -OUT], [OUT, -OUT], [OUT, OUT], [H, OUT], [H, SOUTH], [0.9, SOUTH], [0.9, SOUTH + PORCH], [-0.9, SOUTH + PORCH], [-0.9, SOUTH], [-H, SOUTH], [-H, OUT], [-OUT, OUT]];
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
};

const onConferenceRing = (w: Segment) => Math.abs(Math.hypot((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2) - CONF_RADIUS) < 0.2;

function wallColor(w: Segment) {
  if (w.color) return w.color;
  const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
  const o = OFFICES.find((r) => mx >= r.min[0] - 0.01 && mx <= r.max[0] + 0.01 && mz >= r.min[1] - 0.01 && mz <= r.max[1] + 0.01);
  return o ? COLORS[o.wallColor] : COLORS.cream;
}

const doorHeight = (d: DoorDef) => (d.kind === 'entrance' ? 2.2 : 2.1);
const glassDoor = (d: DoorDef) => d.kind === 'conference' || d.kind === 'room';
// Which glass a pane belongs to: an office's (frosted by its owner), the conference ring's (its wall panel) or plain.
const glassKey = (slot: number | undefined, ring: boolean) => (slot !== undefined ? `o${slot}` : ring ? 'conf' : 'plain');

const materials = (() => {
  let made: { wall: THREE.Material; frosted: THREE.Material; band: THREE.Material; floor: THREE.Material; ceiling: THREE.Material } | null = null;
  return () => (made ??= {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, map: wallWash(), roughness: 0.9 }),
    frosted: new THREE.MeshStandardMaterial({ color: '#f4f1ec', transparent: true, opacity: 0.9, roughness: 0.9 }),
    band: new THREE.MeshStandardMaterial({ color: '#f7f4ee', transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false }),
    // Polished stone: a clear coat picks up soft reflections of the lights (clean, glassy look).
    floor: new THREE.MeshPhysicalMaterial({ map: floorTexture(), roughness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.2 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#efe5d6', emissive: '#f3e7d4', emissiveIntensity: 0.22, roughness: 1, side: THREE.DoubleSide }),
  });
})();

function buildShell() {
  const walls = buildWalls().filter((w) => w.kind !== 'obstacle' && !(w.kind === 'solid' && onConferenceRing(w)));
  const solid = new Batch(true), rest = new Batch();
  const panes = new Map<string, Batch>(), bands = new Map<string, Batch>();
  const group = (m: Map<string, Batch>, key: string) => { if (!m.has(key)) m.set(key, new Batch()); return m.get(key)!; };
  for (const w of walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const rot = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    const x = (w.a[0] + w.b[0]) / 2, z = (w.a[1] + w.b[1]) / 2;
    if (w.kind !== 'glass') { solid.box([len + 0.02, WALL_HEIGHT, 0.16], [x, WALL_HEIGHT / 2, z], wallColor(w), rot); continue; }
    // Clear glass is slightly tinted and carries a frosted band at eye level so it reads as glass.
    const key = glassKey(w.slot, onConferenceRing(w));
    group(panes, key).box([len, WALL_HEIGHT - 0.1, 0.04], [x, WALL_HEIGHT / 2, z], COLORS.glass, rot);
    group(bands, key).box([len, 0.42, 0.05], [x, 1.25, z], '#f7f4ee', rot);
    rest.push([x, 0, z], rot);
    for (const px of [-len / 2, len / 2]) rest.box([0.06, WALL_HEIGHT, 0.08], [px, WALL_HEIGHT / 2, 0], COLORS.trim);
    rest.box([len, 0.08, 0.08], [0, 0.04, 0], COLORS.trim).box([len, 0.08, 0.08], [0, WALL_HEIGHT - 0.04, 0], COLORS.trim);
    rest.pop();
  }
  // The wall above each door: a glass transom over glass and office doors (frosted with the office), a
  // plain wall piece over the entrance, with a dark head rail.
  for (const d of DOORS) {
    const height = doorHeight(d), h = WALL_HEIGHT - height, x = d.width / 2, y = height + h / 2;
    const cx = d.hinge[0] + Math.cos(d.closed) * x, cz = d.hinge[1] + Math.sin(d.closed) * x;
    if (d.kind === 'entrance') solid.box([d.width, h, 0.16], [cx, y, cz], COLORS.cream, -d.closed);
    else group(panes, glassKey(d.slot, d.kind === 'conference')).box([d.width, h, 0.04], [cx, y, cz], COLORS.glass, -d.closed);
    rest.box([d.width + 0.06, 0.08, 0.1], [cx, height + 0.04, cz], COLORS.trim, -d.closed).box([d.width, 0.08, 0.08], [cx, WALL_HEIGHT - 0.04, cz], COLORS.trim, -d.closed);
  }
  // Floor guide lines.
  for (const l of guideLines()) {
    l.points.slice(1).forEach((p, i) => {
      const q = l.points[i];
      const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
      rest.box([len + 0.08, 0.002, 0.08], [(p[0] + q[0]) / 2, 0.012, (p[1] + q[1]) / 2], l.color === 'orange' ? '#f08a3c' : '#3fb3ad', -Math.atan2(p[1] - q[1], p[0] - q[0]), 'glow');
    });
  }
  // Ceiling lamps: a metal rim and a glowing disc.
  for (const [x, z] of LAMPS) {
    rest.cyl(0.29, 0.29, 0.02, [x, WALL_HEIGHT - 0.012, z], '#d9d2c6', 24);
    rest.cyl(0.24, 0.24, 0.02, [x, WALL_HEIGHT - 0.016, z], LAMP, 24, 'glow');
  }
  // Wall art in offices.
  for (const o of OFFICES) {
    const north = o.slot <= 2;
    const z = north ? o.min[1] + 0.1 : o.max[1] - 0.1;
    const x = (o.min[0] + o.max[0]) / 2 + (o.slot % 2 ? 1.6 : -1.6);
    rest.box([0.98, 0.73, 0.03], [x, 1.8, z], '#5a4636').box([0.9, 0.65, 0.04], [x, 1.8, z], o.wallColor === 'orange' ? '#f6e6cf' : '#dceeee');
  }
  // Floor finishes of the rooms around the "+": dark carpet in the game room, warm wood in the café, sage carpet in the library.
  const finish = (r: { min: [number, number]; max: [number, number] }, color: string) =>
    rest.box([r.max[0] - r.min[0] - 0.16, 0.006, r.max[1] - r.min[1] - 0.16], [(r.min[0] + r.max[0]) / 2, 0.003, (r.min[1] + r.max[1]) / 2], color);
  finish(GAME, '#2c2e52'); finish(HALL, '#26284a'); finish(CAFE, '#c9a179'); finish(LIBRARY, '#a9bba2');
  // Porch floor outside the entrance.
  rest.box([1.8, 0.008, PORCH], [0, 0.004, SOUTH + PORCH / 2], '#9c8f7d');
  const built = (m: Map<string, Batch>) => Object.fromEntries([...m].map(([k, b]) => [k, b.build().matte!]));
  return { solid: solid.build().matte!, rest: rest.build(), panes: built(panes), bands: built(bands) };
}

// A hinged door leaf as two meshes at most: the lit parts (wood or rail, handles) and, for glass doors, the pane.
const leafCache = new Map<string, { matte: THREE.BufferGeometry; pane?: THREE.BufferGeometry }>();
function leafGeometry(d: DoorDef) {
  const height = doorHeight(d), glass = glassDoor(d);
  const key = `${glass}:${d.width}:${height}`;
  let g = leafCache.get(key);
  if (!g) {
    const b = new Batch();
    if (glass) b.box([d.width - 0.02, 0.06, 0.07], [d.width / 2, height / 2, 0], COLORS.trim).box([0.05, height, 0.07], [0.025, height / 2, 0], COLORS.trim);
    else b.box([d.width - 0.04, height, 0.06], [d.width / 2, height / 2, 0], COLORS.wood);
    for (const s of [-1, 1]) b.sphere(0.04, [d.width - 0.15, 1.0, s * 0.06], COLORS.gold, 8);
    g = { matte: b.build().matte!, pane: glass ? new THREE.BoxGeometry(d.width - 0.04, height, 0.06).translate(d.width / 2, height / 2, 0) : undefined };
    leafCache.set(key, g);
  }
  return g;
}

// Hinged doors; E toggles them and they swing smoothly. Everyone sees the same state (shared over
// WebRTC); access rules only decide who may pass (Player). The animated angle is what the player collides with.
function Doors() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 7);
    DOORS.forEach((def, i) => {
      const target = isDoorOpen(def.id) ? def.open : def.closed;
      const cur = doorAngles.get(def.id) ?? def.closed;
      if (cur === target && refs.current[i]?.rotation.y === -cur) return;
      const next = cur + (target - cur) * k;
      const angle = Math.abs(target - next) < 0.002 ? target : next;
      doorAngles.set(def.id, angle);
      const g = refs.current[i];
      if (g) g.rotation.y = -angle;
    });
  });
  return (
    <>
      {DOORS.map((def, i) => {
        const g = leafGeometry(def);
        return (
          <group key={def.id} ref={(el) => { refs.current[i] = el; }} position={[def.hinge[0], 0, def.hinge[1]]} rotation-y={-(doorAngles.get(def.id) ?? def.closed)}>
            <mesh geometry={g.matte} material={batchMaterials.matte} />
            {g.pane && <mesh geometry={g.pane} material={def.kind === 'conference' ? confGlass.pane : batchMaterials.glass} renderOrder={2} />}
          </group>
        );
      })}
    </>
  );
}

export function Building({ offices }: { offices: Office[] }) {
  const shell = useMemo(() => buildShell(), []);
  const shape = useMemo(() => footprint(), []);
  const mat = materials();
  useEffect(() => () => {
    shell.solid.dispose();
    Object.values(shell.rest).forEach((g) => g.dispose());
    [...Object.values(shell.panes), ...Object.values(shell.bands)].forEach((g) => g.dispose());
  }, [shell]);
  const frosted = (key: string) => key.startsWith('o') && offices.find((o) => `o${o.slot}` === key)?.glass === 'frosted';
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} material={mat.floor}><shapeGeometry args={[shape]} /></mesh>
      {/* Lit ceiling */}
      <mesh rotation-x={-Math.PI / 2} position-y={WALL_HEIGHT} material={mat.ceiling}><shapeGeometry args={[shape]} /></mesh>
      <mesh geometry={shell.solid} material={mat.wall} />
      {shell.rest.matte && <mesh geometry={shell.rest.matte} material={batchMaterials.matte} />}
      {shell.rest.glow && <mesh geometry={shell.rest.glow} material={batchMaterials.glow} />}
      {Object.entries(shell.panes).map(([key, g]) => (
        <mesh key={key} geometry={g} renderOrder={2} material={key === 'conf' ? confGlass.pane : frosted(key) ? mat.frosted : batchMaterials.glass} />
      ))}
      {Object.entries(shell.bands).map(([key, g]) => (
        <mesh key={key} geometry={g} renderOrder={3} visible={!frosted(key)} material={key === 'conf' ? confGlass.band : mat.band} />
      ))}
      <Doors />
    </group>
  );
}
