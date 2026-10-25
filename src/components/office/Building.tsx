'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { doorAllowed } from './Player';
import { DOORS, doorAngles, isDoorOpen } from './doors';
import { buildWalls, OFFICES, WALL_HEIGHT, H, OUT, SOUTH, PORCH, CONF_RADIUS, RECEPTION_Z, guideLines, type DoorDef, type Segment } from './layout';
import { wallWash } from './textures';
import { confGlass } from './conferenceGlass';

// Brighter than white, so lamps glow (bloom) in high quality; plain white otherwise.
const LAMP = new THREE.Color(1.5, 1.42, 1.25);
const COLORS = { orange: '#e8743b', teal: '#2f8f8a', cream: '#efe4d2', trim: '#3a3330', floor: '#d9cdbb', glass: '#c9e6e3', wood: '#a8774f' };

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
  g.strokeStyle = 'rgba(120,98,76,0.22)'; g.lineWidth = 2;
  for (let i = 0; i <= S; i += T) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const footprint = () => {
  const s = new THREE.Shape();
  const pts: [number, number][] = [[-OUT, -OUT], [-H, -OUT], [-H, -H], [H, -H], [H, -OUT], [OUT, -OUT], [OUT, OUT], [H, OUT], [H, SOUTH], [0.9, SOUTH], [0.9, SOUTH + PORCH], [-0.9, SOUTH + PORCH], [-0.9, SOUTH], [-H, SOUTH], [-H, OUT], [-OUT, OUT]];
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
};

const onConferenceRing = (w: Segment) => Math.abs(Math.hypot((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2) - CONF_RADIUS) < 0.2;

function wallColor(w: Segment) {
  const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
  const o = OFFICES.find((r) => mx >= r.min[0] - 0.01 && mx <= r.max[0] + 0.01 && mz >= r.min[1] - 0.01 && mz <= r.max[1] + 0.01);
  return o ? COLORS[o.wallColor] : COLORS.cream;
}

// `shared`: the conference ring's glass, whose frosting is set from its wall panel (see conferenceGlass).
function WallPiece({ w, color, glass, frosted, shared }: { w: Segment; color: string; glass: boolean; frosted: boolean; shared?: typeof confGlass }) {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const angle = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const pos: [number, number, number] = [(w.a[0] + w.b[0]) / 2, WALL_HEIGHT / 2, (w.a[1] + w.b[1]) / 2];
  if (!glass) {
    return (
      <mesh position={pos} rotation-y={-angle}>
        <boxGeometry args={[len + 0.02, WALL_HEIGHT, 0.16]} />
        <meshStandardMaterial color={color} map={wallWash()} roughness={0.9} />
      </mesh>
    );
  }
  // Clear glass is slightly tinted and carries a frosted band at eye level so it reads as glass.
  return (
    <group position={[pos[0], 0, pos[2]]} rotation-y={-angle}>
      {shared ? (
        <>
          <mesh position-y={WALL_HEIGHT / 2} material={shared.pane}><boxGeometry args={[len, WALL_HEIGHT - 0.1, 0.04]} /></mesh>
          <mesh position-y={1.25} material={shared.band}><boxGeometry args={[len, 0.42, 0.05]} /></mesh>
        </>
      ) : (
        <>
          <mesh position-y={WALL_HEIGHT / 2}>
            <boxGeometry args={[len, WALL_HEIGHT - 0.1, 0.04]} />
            <meshStandardMaterial color={frosted ? '#f4f1ec' : COLORS.glass} transparent opacity={frosted ? 0.9 : 0.3} roughness={frosted ? 0.9 : 0.04} metalness={frosted ? 0 : 0.15} envMapIntensity={frosted ? 1 : 2} depthWrite={frosted} />
          </mesh>
          {!frosted && (
            <mesh position-y={1.25}>
              <boxGeometry args={[len, 0.42, 0.05]} />
              <meshStandardMaterial color="#f7f4ee" transparent opacity={0.55} roughness={0.9} depthWrite={false} />
            </mesh>
          )}
        </>
      )}
      {[-len / 2, len / 2].map((x) => (
        <mesh key={x} position={[x, WALL_HEIGHT / 2, 0]}><boxGeometry args={[0.06, WALL_HEIGHT, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
      ))}
      <mesh position-y={0.04}><boxGeometry args={[len, 0.08, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
      <mesh position-y={WALL_HEIGHT - 0.04}><boxGeometry args={[len, 0.08, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
    </group>
  );
}

// Hinged door leaf; E toggles it (shared state) and it swings smoothly. A visitor without access
// always sees it closed. The animated angle is also what the player collides with.
function Door({ def, allowed }: { def: DoorDef; allowed: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const target = isDoorOpen(def.id) && allowed ? def.open : def.closed;
    const cur = doorAngles.get(def.id) ?? def.closed;
    const next = cur + (target - cur) * (1 - Math.exp(-dt * 7));
    doorAngles.set(def.id, Math.abs(target - next) < 0.002 ? target : next);
    if (ref.current) ref.current.rotation.y = -(doorAngles.get(def.id) ?? 0);
  });
  const glassDoor = def.kind === 'conference';
  const height = def.kind === 'entrance' ? 2.2 : 2.1;
  return (
    <group ref={ref} position={[def.hinge[0], 0, def.hinge[1]]}>
      {glassDoor ? (
        <mesh position={[def.width / 2, height / 2, 0]} material={confGlass.pane}><boxGeometry args={[def.width - 0.04, height, 0.06]} /></mesh>
      ) : (
        <mesh position={[def.width / 2, height / 2, 0]}>
          <boxGeometry args={[def.width - 0.04, height, 0.06]} />
          <meshStandardMaterial color={COLORS.wood} roughness={0.7} />
        </mesh>
      )}
      {glassDoor && <mesh position={[def.width / 2, height / 2, 0]}><boxGeometry args={[def.width - 0.02, 0.06, 0.07]} /><meshStandardMaterial color={COLORS.trim} /></mesh>}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[def.width - 0.15, 1.0, s * 0.06]}><sphereGeometry args={[0.04, 10, 8]} /><meshStandardMaterial color="#d8c28a" metalness={0.6} roughness={0.3} /></mesh>
      ))}
    </group>
  );
}

// The wall above a door (it used to be open up to the ceiling): a glass transom over the glass
// doors (frosted with its office) and a plain wall piece over the entrance, with a dark head rail.
function DoorHeader({ def, frosted }: { def: DoorDef; frosted: boolean }) {
  const height = def.kind === 'entrance' ? 2.2 : 2.1;
  const h = WALL_HEIGHT - height;
  const x = def.width / 2, y = height + h / 2;
  return (
    <group position={[def.hinge[0], 0, def.hinge[1]]} rotation-y={-def.closed}>
      {def.kind === 'entrance' ? (
        <mesh position={[x, y, 0]}><boxGeometry args={[def.width, h, 0.16]} /><meshStandardMaterial color={COLORS.cream} map={wallWash()} roughness={0.9} /></mesh>
      ) : def.kind === 'conference' ? (
        <mesh position={[x, y, 0]} material={confGlass.pane}><boxGeometry args={[def.width, h, 0.04]} /></mesh>
      ) : (
        <mesh position={[x, y, 0]}>
          <boxGeometry args={[def.width, h, 0.04]} />
          <meshStandardMaterial color={frosted ? '#f4f1ec' : COLORS.glass} transparent opacity={frosted ? 0.9 : 0.3} roughness={frosted ? 0.9 : 0.04} metalness={frosted ? 0 : 0.15} envMapIntensity={frosted ? 1 : 2} depthWrite={frosted} />
        </mesh>
      )}
      <mesh position={[x, height + 0.04, 0]}><boxGeometry args={[def.width + 0.06, 0.08, 0.1]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
      <mesh position={[x, WALL_HEIGHT - 0.04, 0]}><boxGeometry args={[def.width, 0.08, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
    </group>
  );
}

function GuideLines() {
  const lines = useMemo(() => guideLines(), []);
  return (
    <group position-y={0.012}>
      {lines.flatMap((l, li) => l.points.slice(1).map((p, i) => {
        const q = l.points[i];
        const len = Math.hypot(p[0] - q[0], p[1] - q[1]);
        const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
        return (
          <mesh key={`${li}-${i}`} position={[(p[0] + q[0]) / 2, 0, (p[1] + q[1]) / 2]} rotation={[-Math.PI / 2, 0, -ang]}>
            <planeGeometry args={[len + 0.08, 0.08]} />
            <meshBasicMaterial color={l.color === 'orange' ? '#f08a3c' : '#3fb3ad'} toneMapped={false} />
          </mesh>
        );
      }))}
    </group>
  );
}

export function Building({ offices, viewerId, invitedSlots }: { offices: Office[]; viewerId: string; invitedSlots: number[] }) {
  // Obstacles are invisible; the conference room draws its own panelling (ConferenceRoom).
  const walls = useMemo(() => buildWalls().filter((w) => w.kind !== 'obstacle' && !(w.kind === 'solid' && onConferenceRing(w))), []);
  const tex = useMemo(() => floorTexture(), []);
  const shape = useMemo(() => footprint(), []);
  const officeState = (slot?: number) => offices.find((o) => o.slot === slot);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <shapeGeometry args={[shape]} />
        {/* Polished stone: a clear coat picks up soft reflections of the lights (clean, glassy look). */}
        <meshPhysicalMaterial map={tex} roughness={0.55} clearcoat={0.7} clearcoatRoughness={0.18} envMapIntensity={1.2} />
      </mesh>
      {/* Lit ceiling (it used to be unlit and flat) */}
      <mesh rotation-x={-Math.PI / 2} position-y={WALL_HEIGHT}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#efe5d6" emissive="#f3e7d4" emissiveIntensity={0.22} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Porch floor outside the entrance */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, SOUTH + PORCH / 2]}><planeGeometry args={[1.8, PORCH]} /><meshStandardMaterial color="#9c8f7d" roughness={0.9} /></mesh>
      {walls.map((w, i) => {
        const o = officeState(w.slot);
        const frosted = w.kind === 'glass' && !!o && o.glass === 'frosted';
        return <WallPiece key={i} w={w} color={wallColor(w)} glass={w.kind === 'glass'} frosted={frosted} shared={w.kind === 'glass' && onConferenceRing(w) ? confGlass : undefined} />;
      })}
      {DOORS.map((d) => <Door key={d.id} def={d} allowed={doorAllowed(d, offices, viewerId, invitedSlots)} />)}
      {DOORS.map((d) => <DoorHeader key={d.id} def={d} frosted={officeState(d.slot)?.glass === 'frosted'} />)}
      <GuideLines />
      {/* Ceiling lamps */}
      {[[0, RECEPTION_Z - 1], [0, SOUTH - 1.5], [-(H + OUT) / 2, 0], [(H + OUT) / 2, 0], [-(H + OUT) / 2, -H + 2], [(H + OUT) / 2, H - 2], ...OFFICES.map((o) => [(o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2])].map(([x, z], i) => (
        <group key={i} position={[x, WALL_HEIGHT - 0.02, z]} rotation-x={Math.PI / 2}>
          <mesh><ringGeometry args={[0.24, 0.29, 32]} /><meshStandardMaterial color="#d9d2c6" roughness={0.4} metalness={0.3} side={THREE.DoubleSide} /></mesh>
          <mesh position-z={0.005}><circleGeometry args={[0.24, 32]} /><meshBasicMaterial color={LAMP} toneMapped={false} /></mesh>
        </group>
      ))}
      {/* Wall art in offices */}
      {OFFICES.map((o) => {
        const north = o.slot <= 2;
        const z = north ? o.min[1] + 0.1 : o.max[1] - 0.1;
        const x = (o.min[0] + o.max[0]) / 2 + (o.slot % 2 ? 1.6 : -1.6);
        return (
          <mesh key={o.slot} position={[x, 1.8, z]} rotation-y={north ? 0 : Math.PI}>
            <planeGeometry args={[0.9, 0.65]} />
            <meshStandardMaterial color={o.wallColor === 'orange' ? '#f6e6cf' : '#dceeee'} />
          </mesh>
        );
      })}
    </group>
  );
}
