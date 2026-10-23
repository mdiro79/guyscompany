'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { isDoorClosed } from './Player';
import { buildWalls, OFFICES, WALL_HEIGHT, H, OUT, SOUTH, CONF_RADIUS, guideLines, type Segment } from './layout';

const COLORS = { orange: '#e8743b', teal: '#2f8f8a', cream: '#efe4d2', trim: '#3a3330', floor: '#d9cdbb', glass: '#bfe3e0', wood: '#a8774f' };

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8ccb9'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + Math.random() * 60},${100 + Math.random() * 50},80,0.06)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(120,100,80,0.18)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const footprint = () => {
  const s = new THREE.Shape();
  const pts: [number, number][] = [[-OUT, -OUT], [-H, -OUT], [-H, -H], [H, -H], [H, -OUT], [OUT, -OUT], [OUT, OUT], [H, OUT], [H, SOUTH], [-H, SOUTH], [-H, OUT], [-OUT, OUT]];
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
};

function wallColor(w: Segment) {
  const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
  const o = OFFICES.find((r) => mx >= r.min[0] - 0.01 && mx <= r.max[0] + 0.01 && mz >= r.min[1] - 0.01 && mz <= r.max[1] + 0.01);
  return o ? COLORS[o.wallColor] : COLORS.cream;
}

function WallPiece({ w, color, glass, frosted }: { w: Segment; color: string; glass: boolean; frosted: boolean }) {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const angle = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const pos: [number, number, number] = [(w.a[0] + w.b[0]) / 2, WALL_HEIGHT / 2, (w.a[1] + w.b[1]) / 2];
  if (!glass) {
    return (
      <mesh position={pos} rotation-y={-angle}>
        <boxGeometry args={[len + 0.02, WALL_HEIGHT, 0.16]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    );
  }
  return (
    <group position={[pos[0], 0, pos[2]]} rotation-y={-angle}>
      <mesh position-y={WALL_HEIGHT / 2}>
        <boxGeometry args={[len, WALL_HEIGHT - 0.1, 0.04]} />
        <meshStandardMaterial color={frosted ? '#f4f1ec' : COLORS.glass} transparent opacity={frosted ? 0.9 : 0.22} roughness={frosted ? 0.9 : 0.05} metalness={0} depthWrite={frosted} />
      </mesh>
      {[-len / 2, len / 2].map((x) => (
        <mesh key={x} position={[x, WALL_HEIGHT / 2, 0]}><boxGeometry args={[0.06, WALL_HEIGHT, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
      ))}
      <mesh position-y={0.04}><boxGeometry args={[len, 0.08, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
      <mesh position-y={WALL_HEIGHT - 0.04}><boxGeometry args={[len, 0.08, 0.08]} /><meshStandardMaterial color={COLORS.trim} /></mesh>
    </group>
  );
}

function Door({ office, closed }: { office: (typeof OFFICES)[number]; closed: boolean }) {
  const { a, b } = office.door;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const north = office.slot <= 2;
  // Hinged at a; swings into the office when open.
  const open = closed ? 0 : (north ? 1 : -1) * 1.35;
  return (
    <group position={[a[0], 0, a[1]]} rotation-y={open}>
      <mesh position={[len / 2, 1.05, 0]}>
        <boxGeometry args={[len - 0.04, 2.1, 0.06]} />
        <meshStandardMaterial color={COLORS.wood} roughness={0.7} />
      </mesh>
      <mesh position={[len - 0.15, 1.0, north ? -0.06 : 0.06]}><sphereGeometry args={[0.04, 10, 8]} /><meshStandardMaterial color="#d8c28a" metalness={0.6} roughness={0.3} /></mesh>
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
  const walls = useMemo(() => buildWalls().filter((w) => w.kind !== 'obstacle'), []);
  const tex = useMemo(() => floorTexture(), []);
  const shape = useMemo(() => footprint(), []);
  const officeState = (slot?: number) => offices.find((o) => o.slot === slot);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position-y={WALL_HEIGHT}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color="#d8cab3" side={THREE.DoubleSide} />
      </mesh>
      {/* Conference floor ring */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.008}><ringGeometry args={[CONF_RADIUS - 0.6, CONF_RADIUS - 0.35, 64]} /><meshStandardMaterial color="#3fa7a1" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.006}><circleGeometry args={[CONF_RADIUS, 64]} /><meshStandardMaterial color="#cfe0d8" roughness={0.8} /></mesh>
      {walls.map((w, i) => {
        const o = officeState(w.slot);
        const frosted = w.kind === 'glass' && !!o && o.glass === 'frosted';
        return <WallPiece key={i} w={w} color={wallColor(w)} glass={w.kind === 'glass'} frosted={frosted} />;
      })}
      {OFFICES.map((r) => {
        const o = officeState(r.slot);
        return <Door key={r.slot} office={r} closed={isDoorClosed(o, viewerId, invitedSlots) || !!o?.locked} />;
      })}
      {/* Entrance door, open */}
      <group position={[-0.9, 0, SOUTH]} rotation-y={-1.2}>
        <mesh position={[0.9, 1.1, 0]}><boxGeometry args={[1.76, 2.2, 0.07]} /><meshStandardMaterial color={COLORS.wood} /></mesh>
      </group>
      <GuideLines />
      {/* Ceiling lamps */}
      {[[0, 0], [0, 7], [-8.5, 0], [8.5, 0], ...OFFICES.map((o) => [(o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2])].map(([x, z], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT - 0.03, z]} rotation-x={Math.PI / 2}><circleGeometry args={[0.35, 24]} /><meshBasicMaterial color="#fff1d6" toneMapped={false} /></mesh>
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
