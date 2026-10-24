'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import {
  buildWalls, conferenceSeats, CONF_RADIUS, CONF_TABLE_RADIUS, CONF_TABLE_HOLE, CONF_TABLE_HEIGHT, CONF_SCREEN, CONF_CREDENZA, CONF_PLANTS, CONF_WALL_PANEL,
  WALL_HEIGHT, type Segment,
} from './layout';
import { GroundShadow } from './GroundShadow';
import { drawBoard } from '@/lib/board/draw';
import { BOARD_W } from '@/lib/board/model';
import { boardItems, presenterId, subscribeBoards } from '@/lib/board/sync';
import { tableWood, oak, slats, carpet, panelWash, floorGlow, tabletScreen, paintScreen, paintRoomPanel, type MeetingLabels } from './textures';
import { roomControls, useRoomSettings } from './roomControls';
import { useConferenceGlass } from './conferenceGlass';
import { ENV_INTENSITY, HEMI_NAME, hemiIntensity } from './lighting';
import { officeUi, useOfficeUi } from './store';

// The round conference room after the owner's reference image: a large light-oak table with a planter
// in the middle and a glowing ring under its pedestal, light-blue armchairs with white frames, a tablet
// at every seat, a big meeting screen on cream panelling above an oak media cabinet, slim plants on both
// sides, a rose carpet and a ring of light in the ceiling. Everything is built here in code.

const FRAME = '#f6f4f0';
const CUSHION = '#86a7df';
const SCREEN_PX: [number, number] = [2048, 1152];
const LIGHT = new THREE.Color(2, 1.8, 1.45); // above white: glows in high quality

const mat = {
  frame: new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.45 }),
  cushion: new THREE.MeshStandardMaterial({ color: CUSHION, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.35, metalness: 0.3 }),
  trim: new THREE.MeshStandardMaterial({ color: '#2f2925', roughness: 0.6 }),
  pot: new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.5 }),
  soil: new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 1 }),
};

// Lit parts that follow the wall panel (brightness and colour), updated every frame by RoomLights.
const lit = {
  ring: new THREE.MeshBasicMaterial({ color: LIGHT.clone(), toneMapped: false }),
  disc: new THREE.MeshStandardMaterial({ color: '#f7eee0', emissive: '#ffe9c8', emissiveIntensity: 0.06 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#fff2dc', emissive: '#ffd9a0', emissiveIntensity: 0.9 }),
};
const WARM = new THREE.Color('#ffbf73'), COOL = new THREE.Color('#eaf1ff');

// Built once per page (canvas textures exist only in the browser).
const textured = (() => {
  let made: Record<string, THREE.Material> | null = null;
  return () => (made ??= {
    table: new THREE.MeshStandardMaterial({ map: tableWood(), roughness: 0.42 }),
    oak: new THREE.MeshStandardMaterial({ map: oak(), roughness: 0.6 }),
    slats: new THREE.MeshStandardMaterial({ map: slats(), roughness: 0.7 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpet(), roughness: 1 }),
    panel: new THREE.MeshStandardMaterial({ map: panelWash(), roughness: 0.95 }),
    glow: new THREE.MeshBasicMaterial({ map: floorGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    tablet: new THREE.MeshBasicMaterial({ map: tabletScreen(), toneMapped: false }),
  });
})();

// Armchair facing local -Z (the table), so rotation-y = seat.facing turns it towards the table.
function Chair() {
  return (
    <group>
      {/* seat and back cushions */}
      <RoundedBox args={[0.54, 0.11, 0.5]} radius={0.04} smoothness={3} position={[0, 0.43, -0.02]} material={mat.cushion} />
      <group position={[0, 0.79, 0.25]} rotation-x={0.14}>
        <RoundedBox args={[0.52, 0.5, 0.1]} radius={0.04} smoothness={3} material={mat.cushion} />
        <RoundedBox args={[0.6, 0.6, 0.05]} radius={0.02} smoothness={2} position={[0, 0.02, 0.07]} material={mat.frame} />
      </group>
      {/* white frame: seat base, two side frames with armrests and runners */}
      <RoundedBox args={[0.6, 0.06, 0.54]} radius={0.02} smoothness={2} position={[0, 0.35, -0.02]} material={mat.frame} />
      {[-1, 1].map((s) => (
        <group key={s} position-x={s * 0.32}>
          <RoundedBox args={[0.07, 0.05, 0.56]} radius={0.02} smoothness={2} position={[0, 0.65, -0.02]} material={mat.frame} />
          <mesh position={[0, 0.33, -0.26]} material={mat.frame}><boxGeometry args={[0.05, 0.66, 0.05]} /></mesh>
          <mesh position={[0, 0.48, 0.24]} material={mat.frame}><boxGeometry args={[0.05, 0.96, 0.05]} /></mesh>
          <mesh position={[0, 0.02, -0.01]} material={mat.frame}><boxGeometry args={[0.05, 0.04, 0.62]} /></mesh>
        </group>
      ))}
    </group>
  );
}

// Seat tablet on a small stand, its screen turned up towards the person (local +Z).
function Tablet({ material }: { material: THREE.Material }) {
  return (
    <group rotation-x={-0.62} position-y={0.075}>
      <RoundedBox args={[0.3, 0.19, 0.018]} radius={0.008} smoothness={2} material={mat.dark} />
      <mesh position-z={0.0095} material={material}><planeGeometry args={[0.272, 0.166]} /></mesh>
      <mesh position={[0, -0.02, -0.04]} rotation-x={0.9} material={mat.dark}><boxGeometry args={[0.16, 0.12, 0.01]} /></mesh>
    </group>
  );
}

// Minimal greenery (owner request: plants should not draw the eye): a few slim upright blades in
// a muted sage, tapering to a point, in a small matte pot. Shared by the corner pots and the table.
const BLADE = new THREE.MeshStandardMaterial({ color: '#8fa889', roughness: 0.85, side: THREE.DoubleSide });
function Blades({ count, height, width, lean, seed = 1 }: { count: number; height: number; width: number; lean: number; seed?: number }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, height, 1, 6).translate(0, height / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / height;
      p.setX(i, p.getX(i) * (1 - t * 0.85));
      p.setZ(i, 0.12 * height * t * t);
    }
    g.computeVertexNormals();
    return g;
  }, [width, height]);
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + seed;
        const k = 0.8 + ((i * 5 + seed) % 4) * 0.08;
        return <group key={i} rotation-y={a}><mesh geometry={geom} material={BLADE} rotation-x={lean * (0.6 + (i % 3) * 0.25)} scale={[1, k, 1]} /></group>;
      })}
    </group>
  );
}

function Plant({ pos }: { pos: [number, number] }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <GroundShadow size={[0.55, 0.55]} opacity={0.25} />
      <mesh position-y={0.2} material={mat.pot}><cylinderGeometry args={[0.15, 0.13, 0.4, 32]} /></mesh>
      <mesh position-y={0.395} material={mat.soil}><cylinderGeometry args={[0.135, 0.135, 0.01, 24]} /></mesh>
      <group position-y={0.39}><Blades count={7} height={0.62} width={0.07} lean={0.16} seed={pos[0] > 0 ? 2 : 1} /></group>
    </group>
  );
}

function Table() {
  const m = textured();
  const H = CONF_TABLE_HEIGHT, R = CONF_TABLE_RADIUS, hole = CONF_TABLE_HOLE;
  return (
    <group>
      <mesh position-y={H} rotation-x={-Math.PI / 2} material={m.table}><ringGeometry args={[hole, R, 128, 1]} /></mesh>
      <mesh position-y={H - 0.035} material={m.oak}><cylinderGeometry args={[R, R - 0.02, 0.07, 128, 1, true]} /></mesh>
      <mesh position-y={H} rotation-x={-Math.PI / 2}><torusGeometry args={[R - 0.012, 0.014, 8, 128]} /><meshStandardMaterial color="#efd9b6" roughness={0.4} /></mesh>
      <mesh position-y={H - 0.07} rotation-x={Math.PI / 2} material={m.oak}><ringGeometry args={[hole, R - 0.02, 96, 1]} /></mesh>
      {/* planter in the middle */}
      <mesh position-y={H - 0.05}><cylinderGeometry args={[hole, hole, 0.1, 64, 1, true]} /><meshStandardMaterial color="#c9a273" side={THREE.DoubleSide} /></mesh>
      <mesh position-y={H - 0.03} material={mat.soil}><cylinderGeometry args={[hole - 0.01, hole - 0.01, 0.02, 48]} /></mesh>
      {/* a low bed of moss with a few short blades, kept under eye level across the table */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2, d = i ? 0.17 : 0;
        return <mesh key={i} position={[Math.sin(a) * d, H - 0.01, Math.cos(a) * d]} scale={[1, 0.35, 1]} material={BLADE}><icosahedronGeometry args={[0.11, 1]} /></mesh>;
      })}
      <group position-y={H - 0.02}><Blades count={6} height={0.2} width={0.05} lean={0.35} seed={4} /></group>
      {/* pedestal, its plinth and the glowing ring on the carpet */}
      <mesh position-y={(H - 0.07) / 2} material={m.oak}><cylinderGeometry args={[0.58, 0.88, H - 0.07, 64, 1, true]} /></mesh>
      <mesh position-y={0.025} material={lit.plinth}><cylinderGeometry args={[0.9, 0.92, 0.05, 64]} /></mesh>
      <mesh position-y={0.012} rotation-x={-Math.PI / 2} material={m.glow}><planeGeometry args={[2.7, 2.7]} /></mesh>
      <GroundShadow size={[R * 2.25, R * 2.25]} opacity={0.3} y={0.008} />
    </group>
  );
}

function Screen({ labels }: { labels: MeetingLabels }) {
  const { tex, cv } = useMemo(() => {
    const cv = document.createElement('canvas');
    [cv.width, cv.height] = SCREEN_PX;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return { tex, cv };
  }, []);
  // The meeting page, or the presenter's drawing board live while someone presents. Painted at most
  // once a frame, only when what it shows changed, and again once the web fonts are ready.
  useEffect(() => {
    let live = true, raf = 0;
    let shown: { who: string | null; items: unknown } = { who: '', items: null };
    const paint = (force = false) => {
      raf = 0;
      if (!live) return;
      const who = presenterId();
      const items = who ? boardItems(who) : null;
      if (!force && shown.who === who && shown.items === items) return;
      shown = { who, items };
      if (who) drawBoard(cv.getContext('2d')!, boardItems(who), cv.width / BOARD_W, () => schedule(true));
      else paintScreen(cv, labels);
      tex.needsUpdate = true;
    };
    const schedule = (force = false) => { if (force) shown = { who: '', items: null }; if (!raf) raf = requestAnimationFrame(() => paint()); };
    const off = subscribeBoards(() => schedule());
    paint(true);
    const fam = labels.rtl ? '"Vazirmatn Variable"' : '"Inter Variable"';
    Promise.all([document.fonts.load(`650 64px ${fam}`), document.fonts.load(`400 32px ${fam}`)]).then(() => schedule(true), () => {});
    return () => { live = false; off(); cancelAnimationFrame(raf); };
  }, [cv, tex, labels]);
  useEffect(() => () => tex.dispose(), [tex]);
  const { width: w, height: h, bottom, z } = CONF_SCREEN;
  return (
    <group position={[0, bottom + h / 2, z]}>
      <mesh material={mat.dark}><boxGeometry args={[w + 0.1, h + 0.1, 0.06]} /></mesh>
      <mesh position-z={0.031}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}

function Credenza() {
  const m = textured();
  const { z, halfWidth: hw, halfDepth: hd, height: h } = CONF_CREDENZA;
  return (
    <group position={[0, 0, z]}>
      <GroundShadow size={[hw * 2 + 0.4, hd * 2 + 0.4]} opacity={0.3} />
      <mesh position-y={h / 2 + 0.04} material={m.oak}><boxGeometry args={[hw * 2, h - 0.04, hd * 2]} /></mesh>
      <mesh position={[0, h / 2 + 0.04, hd + 0.002]} material={m.slats}><planeGeometry args={[hw * 2 - 0.12, h - 0.16]} /></mesh>
      <mesh position-y={h + 0.012} material={m.oak}><boxGeometry args={[hw * 2 + 0.06, 0.025, hd * 2 + 0.04]} /></mesh>
      <mesh position-y={0.02} material={mat.trim}><boxGeometry args={[hw * 2 - 0.1, 0.04, hd * 2 - 0.06]} /></mesh>
      {/* conference camera */}
      <group position={[0, h + 0.06, hd - 0.1]}>
        <RoundedBox args={[0.2, 0.07, 0.08]} radius={0.02} smoothness={2} material={mat.dark} />
        <mesh position-z={0.041}><circleGeometry args={[0.022, 20]} /><meshStandardMaterial color="#0b0c10" metalness={0.6} roughness={0.15} /></mesh>
      </group>
    </group>
  );
}

// Solid conference panels (the arc behind the screen): cream, washed with light from the top, dark posts.
function Panels() {
  const m = textured();
  const segs = useMemo(() => buildWalls().filter((w) => w.kind === 'solid' && Math.abs(Math.hypot((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2) - CONF_RADIUS) < 0.2), []);
  return (
    <group>
      {segs.map((w: Segment, i) => {
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const angle = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
        return (
          <group key={i} position={[(w.a[0] + w.b[0]) / 2, 0, (w.a[1] + w.b[1]) / 2]} rotation-y={-angle}>
            <mesh position-y={WALL_HEIGHT / 2} material={m.panel}><boxGeometry args={[len + 0.01, WALL_HEIGHT, 0.12]} /></mesh>
            <mesh position={[len / 2, WALL_HEIGHT / 2, 0]} material={mat.trim}><boxGeometry args={[0.07, WALL_HEIGHT, 0.16]} /></mesh>
            <mesh position-y={0.05} material={mat.trim}><boxGeometry args={[len, 0.1, 0.14]} /></mesh>
          </group>
        );
      })}
    </group>
  );
}

function Ceiling() {
  return (
    <group position-y={WALL_HEIGHT}>
      <mesh position-y={-0.012} rotation-x={Math.PI / 2}><circleGeometry args={[CONF_RADIUS - 0.08, 96]} /><meshStandardMaterial color="#f5ede1" roughness={1} /></mesh>
      <mesh position-y={-0.02} rotation-x={Math.PI / 2} material={lit.ring}><torusGeometry args={[2.45, 0.045, 10, 128]} /></mesh>
      <mesh position-y={-0.016} rotation-x={Math.PI / 2} material={lit.disc}><circleGeometry args={[2.4, 96]} /></mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return <mesh key={i} position={[Math.sin(a) * 3.6, -0.018, Math.cos(a) * 3.6]} rotation-x={Math.PI / 2} material={lit.ring}><circleGeometry args={[0.06, 16]} /></mesh>;
      })}
    </group>
  );
}

export function ConferenceRoom({ labels, lowQuality }: { labels: MeetingLabels; lowQuality: boolean }) {
  const m = textured();
  const seats = useMemo(() => conferenceSeats(), []);
  return (
    <group>
      <mesh position-y={0.006} rotation-x={-Math.PI / 2} material={m.carpet}><circleGeometry args={[CONF_RADIUS - 0.02, 96]} /></mesh>
      <Table />
      {seats.map((s) => (
        <group key={s.id}>
          <group position={[s.pos[0], 0, s.pos[1]]} rotation-y={s.facing}>
            <GroundShadow size={[0.85, 0.85]} opacity={0.3} />
            <Chair />
          </group>
          <group position={[Math.sin(s.facing) * (CONF_TABLE_RADIUS - 0.33), CONF_TABLE_HEIGHT, Math.cos(s.facing) * (CONF_TABLE_RADIUS - 0.33)]} rotation-y={s.facing}>
            <Tablet material={m.tablet} />
          </group>
        </group>
      ))}
      <Panels />
      <Screen labels={labels} />
      <Credenza />
      {CONF_PLANTS.map((p) => <Plant key={p[0]} pos={p} />)}
      <Ceiling />
      <WallPanel />
      <RoomLights low={lowQuality} />
    </group>
  );
}

// The room's lights as set on the wall panel: brightness and warm/cool colour of the ceiling light, the
// ring and downlights, the glow under the table; inside the room the general light dims with them.
// Changes glide over a fraction of a second. The screen and tablets keep their own light (presentations).
function RoomLights({ low }: { low: boolean }) {
  const main = useRef<THREE.PointLight>(null);
  const screen = useRef<THREE.PointLight>(null);
  const under = useRef<THREE.PointLight>(null);
  const { scene } = useThree();
  const hemi = useRef<THREE.HemisphereLight | null>(null);
  const cur = useRef({ b: -1, w: -1, a: 1 });
  const tint = useMemo(() => new THREE.Color(), []);
  useConferenceGlass();
  useFrame((_, dt) => {
    const s = roomControls.get(), c = cur.current, k = 1 - Math.exp(-dt * 6);
    c.b = c.b < 0 ? s.light / 100 : c.b + (s.light / 100 - c.b) * k;
    c.w = c.w < 0 ? s.warmth / 100 : c.w + (s.warmth / 100 - c.w) * k;
    const ambient = officeUi.get().inConference ? 0.3 + 0.7 * c.b : 1;
    c.a += (ambient - c.a) * k;
    tint.lerpColors(COOL, WARM, c.w);
    if (main.current) { main.current.intensity = 8 * c.b; main.current.color.copy(tint); }
    if (screen.current) screen.current.intensity = 1.2 + 1.3 * c.b;
    if (under.current) { under.current.intensity = 1.6 * c.b; under.current.color.copy(tint); }
    lit.ring.color.copy(tint).multiplyScalar(0.3 + 1.7 * c.b);
    lit.disc.emissive.copy(tint); lit.disc.emissiveIntensity = 0.1 * c.b;
    lit.plinth.emissive.copy(tint); lit.plinth.emissiveIntensity = 0.9 * c.b;
    textured().glow.opacity = c.b;
    hemi.current ??= scene.getObjectByName(HEMI_NAME) as THREE.HemisphereLight | null;
    if (hemi.current) hemi.current.intensity = hemiIntensity(low) * c.a;
    scene.environmentIntensity = ENV_INTENSITY * c.a;
  });
  return (
    <>
      <pointLight ref={main} position={[0, 1.9, 0]} intensity={8} distance={8} color="#ffd8a0" />
      {!low && (
        <>
          <pointLight ref={screen} position={[0, CONF_SCREEN.bottom + CONF_SCREEN.height / 2, CONF_SCREEN.z + 1]} intensity={2.5} distance={4.5} color="#b9c4ff" />
          <pointLight ref={under} position={[0, 0.2, 0]} intensity={1.6} distance={2.2} color="#ffd39a" />
        </>
      )}
    </>
  );
}

// Smart panel on the glass beside the door. Its screen shows the current light and glass; it lights up
// when you can use it (E, or the action button on phones), which opens the controls (RoomControls).
function WallPanel() {
  const s = useRoomSettings();
  const active = useOfficeUi((u) => u.interact?.kind === 'panel' || u.roomPanel);
  const { tex, cv } = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 384;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, cv };
  }, []);
  useEffect(() => { paintRoomPanel(cv, s); tex.needsUpdate = true; }, [cv, tex, s]);
  useEffect(() => () => tex.dispose(), [tex]);
  const [x, z] = CONF_WALL_PANEL.pos;
  return (
    <group position={[x, CONF_WALL_PANEL.y, z]} rotation-y={CONF_WALL_PANEL.facing}>
      {active && <mesh position-z={-0.004}><planeGeometry args={[0.25, 0.35]} /><meshBasicMaterial color="#5fe0cf" toneMapped={false} transparent opacity={0.85} /></mesh>}
      <RoundedBox args={[0.21, 0.31, 0.022]} radius={0.01} smoothness={2} material={mat.frame} />
      <mesh position-z={0.0115}><planeGeometry args={[0.18, 0.27]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}
