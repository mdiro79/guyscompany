'use client';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import {
  buildWalls, conferenceSeats, CONF_RADIUS, CONF_TABLE_RADIUS, CONF_TABLE_HOLE, CONF_TABLE_HEIGHT, CONF_SCREEN, CONF_CREDENZA, CONF_PLANTS, CONF_WALL_PANEL,
  WALL_HEIGHT,
} from './layout';
import { GroundShadow } from './GroundShadow';
import { BoardPainter, memberColor } from '@/lib/board/draw';
import { BOARD_H, BOARD_W, onPage } from '@/lib/board/model';
import { boardOf, isHot, lasersOn, presentation, subscribeBoards, writingNow } from '@/lib/board/sync';
import { handQueue, subscribeHands } from '@/lib/board/hands';
import { quickVote, subscribeQuickVote, tally } from '@/lib/board/vote';
import { useVoice } from '@/components/voice/VoiceContext';
import { syncedNow } from '@/lib/realtime/room';
import { clockText } from '@/lib/meetings';
import { Batch, batchMaterials } from './batch';
import { tableWood, oak, slats, carpet, panelWash, floorGlow, softShadow, paintScreen, paintScreenInfo, paintRoomPanel, type MeetingLabels } from './textures';
import { tablet, tabletHit, paintTablet, buttonAt, buttonRects, pressAt, toNdc, TABLET_PX, type TabletButton } from './tablet';
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
const SCREEN_MIN_MS = 100; // the screen picture is repainted at most this often
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
  });
})();

const TABLET_W = 0.56, TABLET_H = 0.35, TABLET_TILT = 0.5;

const tabletCanvas = () => {
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = TABLET_PX;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { cv, tex };
};

// The screen of the tablets at the other seats: one texture for all, repainted when the language changes.
const restScreen = (() => {
  let made: THREE.CanvasTexture | null = null;
  return () => {
    if (made) return made;
    const { cv, tex } = tabletCanvas();
    let labels: unknown;
    const paint = () => {
      const s = tablet.get();
      if (s.labels === labels) return;
      labels = s.labels;
      paintTablet(cv, s, false);
      tex.needsUpdate = true;
    };
    paint();
    tablet.subscribe(paint);
    return (made = tex);
  };
})();

// The tablet at one's own seat is live: its buttons light up under the crosshair or cursor and are pressed
// right on it (tablet.ts). Its body, stand and the resting screens of all seats are part of the room's
// merged meshes (StaticParts); this draws just the live screen over the resting one.
function LiveTablet() {
  const screen = useRef<THREE.Mesh>(null);
  const own = useMemo(() => tabletCanvas(), []);
  useEffect(() => {
    const paint = () => { paintTablet(own.cv, tablet.get(), true); own.tex.needsUpdate = true; };
    paint();
    const off = tablet.subscribe(paint);
    // Text in the web fonts once they are ready.
    document.fonts?.ready.then(paint, () => {});
    const mesh = screen.current;
    tabletHit.mesh = mesh;
    return () => { off(); if (tabletHit.mesh === mesh) tabletHit.mesh = null; own.tex.dispose(); };
  }, [own]);
  return (
    <group rotation-x={-TABLET_TILT} position={[0, (TABLET_H / 2) * Math.cos(TABLET_TILT) + 0.012, 0]}>
      <mesh ref={screen} position-z={0.0135}>
        <planeGeometry args={[TABLET_W, TABLET_H]} />
        <meshBasicMaterial map={own.tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Everything in the room that never moves, merged into a handful of meshes: the eight armchairs, the
// tablets' bodies and stands, the plant pots, the camera and the trims in one; the tablets' resting
// screens in another (one texture); the leaves, the wall panels, the contact shadows and the ceiling's
// lit ring and spots one each. Before, every box of every chair was drawn on its own.
function buildStatic() {
  const matte = new Batch(), leaves = new Batch(), panels = new Batch(true), shadows = new Batch(true), screens = new Batch(true), lights = new Batch();
  const rounded = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
  const cushionSeat = rounded(0.54, 0.11, 0.5, 0.04), cushionBack = rounded(0.52, 0.5, 0.1, 0.04), frameBack = rounded(0.6, 0.6, 0.05, 0.02);
  const frameBase = rounded(0.6, 0.06, 0.54, 0.02), arm = rounded(0.07, 0.05, 0.56, 0.02), body = rounded(TABLET_W + 0.03, TABLET_H + 0.03, 0.022, 0.011);
  const plane = new THREE.PlaneGeometry(1, 1), flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), unit = new THREE.BoxGeometry(1, 1, 1);
  // Places `geo` under a chain of [position, rotation] steps (outermost first), like nested groups.
  const at = (...steps: [[number, number, number], [number, number, number]?, [number, number, number]?][]) => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const [pos, rot = [0, 0, 0], scale = [1, 1, 1]] of steps) m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...pos), q.setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
    return m;
  };
  for (const s of conferenceSeats()) {
    const seat: [[number, number, number], [number, number, number]] = [[s.pos[0], 0, s.pos[1]], [0, s.facing, 0]];
    shadows.addMatrix('matte', flat, '#ffffff', at([[s.pos[0], 0.009, s.pos[1]], [0, 0, 0], [0.85, 1, 0.85]]));
    // Armchair facing the table: cushions, then the white frame with armrests and runners.
    matte.addMatrix('matte', cushionSeat, CUSHION, at(seat, [[0, 0.43, -0.02]]));
    matte.addMatrix('matte', cushionBack, CUSHION, at(seat, [[0, 0.79, 0.25], [0.14, 0, 0]]));
    matte.addMatrix('matte', frameBack, FRAME, at(seat, [[0, 0.79, 0.25], [0.14, 0, 0]], [[0, 0.02, 0.07]]));
    matte.addMatrix('matte', frameBase, FRAME, at(seat, [[0, 0.35, -0.02]]));
    for (const side of [-1, 1]) {
      matte.addMatrix('matte', arm, FRAME, at(seat, [[side * 0.32, 0.65, -0.02]]));
      matte.addMatrix('matte', unit, FRAME, at(seat, [[side * 0.32, 0.33, -0.26], [0, 0, 0], [0.05, 0.66, 0.05]]));
      matte.addMatrix('matte', unit, FRAME, at(seat, [[side * 0.32, 0.48, 0.24], [0, 0, 0], [0.05, 0.96, 0.05]]));
      matte.addMatrix('matte', unit, FRAME, at(seat, [[side * 0.32, 0.02, -0.01], [0, 0, 0], [0.05, 0.04, 0.62]]));
    }
    // The tablet on its stand, screen turned up towards the person.
    const r = CONF_TABLE_RADIUS - 0.3;
    const tab: [[number, number, number], [number, number, number]][] = [[[Math.sin(s.facing) * r, CONF_TABLE_HEIGHT, Math.cos(s.facing) * r], [0, s.facing, 0]], [[0, (TABLET_H / 2) * Math.cos(TABLET_TILT) + 0.012, 0], [-TABLET_TILT, 0, 0]]];
    matte.addMatrix('matte', body, '#16181d', at(...tab));
    matte.addMatrix('matte', unit, '#16181d', at(...tab, [[0, -0.04, -0.09], [0.95, 0, 0], [0.26, 0.22, 0.012]]));
    screens.addMatrix('matte', plane, '#ffffff', at(...tab, [[0, 0, 0.0115], [0, 0, 0], [TABLET_W, TABLET_H, 1]]));
  }
  // Slim plants in white pots on both sides of the screen, and the low bed in the table.
  const blade = (height: number, width: number) => {
    const g = new THREE.PlaneGeometry(width, height, 1, 6).translate(0, height / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / height; p.setX(i, p.getX(i) * (1 - t * 0.85)); p.setZ(i, 0.12 * height * t * t); }
    g.computeVertexNormals();
    return g;
  };
  const blades = (base: [number, number, number], count: number, height: number, width: number, lean: number, seed: number) => {
    const g = blade(height, width);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + seed, k = 0.8 + ((i * 5 + seed) % 4) * 0.08;
      leaves.addMatrix('matte', g, '#8fa889', at([base, [0, a, 0]], [[0, 0, 0], [lean * (0.6 + (i % 3) * 0.25), 0, 0], [1, k, 1]]));
    }
  };
  for (const p of CONF_PLANTS) {
    shadows.addMatrix('matte', flat, '#ffffff', at([[p[0], 0.009, p[1]], [0, 0, 0], [0.55, 1, 0.55]]));
    matte.cyl(0.15, 0.13, 0.4, [p[0], 0.2, p[1]], '#f1eee8', 24).cyl(0.135, 0.135, 0.01, [p[0], 0.395, p[1]], '#4a3526', 20);
    blades([p[0], 0.39, p[1]], 7, 0.62, 0.07, 0.16, p[0] > 0 ? 2 : 1);
  }
  const ico = new THREE.IcosahedronGeometry(0.11, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, d = i ? 0.17 : 0;
    leaves.addMatrix('matte', ico, '#8fa889', at([[Math.sin(a) * d, CONF_TABLE_HEIGHT - 0.01, Math.cos(a) * d], [0, 0, 0], [1, 0.35, 1]]));
  }
  blades([0, CONF_TABLE_HEIGHT - 0.02, 0], 6, 0.2, 0.05, 0.35, 4);
  // Solid panels behind the screen: cream, washed with light from the top, dark posts and skirting.
  for (const w of buildWalls().filter((x) => x.kind === 'solid' && Math.abs(Math.hypot((x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2) - CONF_RADIUS) < 0.2)) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), rot = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    const base: [number, number, number] = [(w.a[0] + w.b[0]) / 2, 0, (w.a[1] + w.b[1]) / 2];
    panels.push(base, rot).box([len + 0.01, WALL_HEIGHT, 0.12], [0, WALL_HEIGHT / 2, 0], '#ffffff').pop();
    matte.push(base, rot).box([0.07, WALL_HEIGHT, 0.16], [len / 2, WALL_HEIGHT / 2, 0], '#2f2925').box([len, 0.1, 0.14], [0, 0.05, 0], '#2f2925').pop();
  }
  // Media cabinet's plinth and the conference camera on it.
  const cz = CONF_CREDENZA.z, ch = CONF_CREDENZA.height, hd = CONF_CREDENZA.halfDepth;
  matte.box([CONF_CREDENZA.halfWidth * 2 - 0.1, 0.04, hd * 2 - 0.06], [0, 0.02, cz], '#2f2925');
  matte.addMatrix('matte', rounded(0.2, 0.07, 0.08, 0.02), '#16181d', at([[0, ch + 0.06, cz + hd - 0.1]]));
  matte.cyl(0.022, 0.022, 0.004, [0, ch + 0.06, cz + hd - 0.058], '#0b0c10', 16, 'matte', 1, [Math.PI / 2, 0, 0]);
  shadows.addMatrix('matte', flat, '#ffffff', at([[0, 0.009, cz], [0, 0, 0], [CONF_CREDENZA.halfWidth * 2 + 0.4, 1, hd * 2 + 0.4]]));
  // The ceiling's ring of light and its ten small spots (one material, dimmed from the wall panel).
  lights.add('matte', new THREE.TorusGeometry(2.45, 0.045, 8, 96), '#ffffff', [0, WALL_HEIGHT - 0.02, 0], [Math.PI / 2, 0, 0]);
  const spot = new THREE.CircleGeometry(0.06, 14);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; lights.add('matte', spot, '#ffffff', [Math.sin(a) * 3.6, WALL_HEIGHT - 0.018, Math.cos(a) * 3.6], [Math.PI / 2, 0, 0]); }
  return { matte: matte.build().matte!, leaves: leaves.build().matte!, panels: panels.build().matte!, shadows: shadows.build().matte!, screens: screens.build().matte!, lights: lights.build().matte! };
}

const staticMaterials = (() => {
  let made: { leaves: THREE.Material; shadow: THREE.Material; rest: THREE.Material } | null = null;
  return () => (made ??= {
    leaves: new THREE.MeshStandardMaterial({ color: '#8fa889', roughness: 0.85, side: THREE.DoubleSide }),
    shadow: new THREE.MeshBasicMaterial({ map: softShadow(), color: '#2b1d12', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    rest: new THREE.MeshBasicMaterial({ map: restScreen(), toneMapped: false, color: '#9aa0aa' }),
  });
})();

function StaticParts() {
  const g = useMemo(() => buildStatic(), []);
  const m = textured(), sm = staticMaterials();
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <>
      <mesh geometry={g.matte} material={batchMaterials.matte} />
      <mesh geometry={g.leaves} material={sm.leaves} />
      <mesh geometry={g.panels} material={m.panel} />
      <mesh geometry={g.shadows} material={sm.shadow} renderOrder={1} />
      <mesh geometry={g.screens} material={sm.rest} />
      <mesh geometry={g.lights} material={lit.ring} />
    </>
  );
}

// Clicks and taps on the live tablet. Computers: the crosshair while looking around, the cursor otherwise;
// phones report taps from the touch layer (TouchControls). The button under the pointer lights up.
function TabletInput() {
  const { camera, gl } = useThree();
  const seated = useOfficeUi((u) => !!u.seatId?.startsWith('conf-'));
  const mouse = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    tabletHit.camera = camera; tabletHit.dom = gl.domElement;
    // Test hook used by screenshot scripts: where a button of the live tablet is on the screen.
    (window as unknown as { __gcTabletAt?: unknown }).__gcTabletAt = (id: TabletButton) => {
      const mesh = tabletHit.mesh, r = buttonRects(!!tablet.get().labels?.rtl).find((b) => b.id === id);
      if (!mesh || !r) return null;
      const p = mesh.localToWorld(new THREE.Vector3(((r.x + r.w / 2) / TABLET_PX[0] - 0.5) * TABLET_W, (0.5 - (r.y + r.h / 2) / TABLET_PX[1]) * TABLET_H, 0)).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
    };
  }, [camera, gl]);
  useEffect(() => {
    if (!seated) { tablet.set({ hover: null }); return; }
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      pressAt(document.pointerLockElement === el ? { x: 0, y: 0 } : toNdc(e.clientX, e.clientY));
    };
    const move = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    el.addEventListener('pointerdown', down);
    window.addEventListener('mousemove', move);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('mousemove', move); tablet.set({ hover: null }); };
  }, [seated, gl]);
  useFrame(() => {
    if (!seated) return;
    const locked = document.pointerLockElement === gl.domElement;
    const ndc = locked ? { x: 0, y: 0 } : mouse.current && toNdc(mouse.current.x, mouse.current.y);
    tablet.set({ hover: ndc ? buttonAt(ndc) : null });
  });
  return null;
}

// Minimal greenery (owner request: plants should not draw the eye): a few slim upright blades in
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
      {/* pedestal, its plinth and the glowing ring on the carpet */}
      <mesh position-y={(H - 0.07) / 2} material={m.oak}><cylinderGeometry args={[0.58, 0.88, H - 0.07, 64, 1, true]} /></mesh>
      <mesh position-y={0.025} material={lit.plinth}><cylinderGeometry args={[0.9, 0.92, 0.05, 64]} /></mesh>
      <mesh position-y={0.012} rotation-x={-Math.PI / 2} material={m.glow}><planeGeometry args={[2.7, 2.7]} /></mesh>
      <GroundShadow size={[R * 2.25, R * 2.25]} opacity={0.3} y={0.008} />
    </group>
  );
}

export interface Person { id: string; name: string }
const colorOf = (people: Person[], id: string) => memberColor(people.map((p) => p.id), id);
const clock = (ms: number) => { const s = Math.ceil(Math.abs(ms) / 1000); return `${ms < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// The picture of the meeting screen: painted once, shown on the wall screen and on the smart screen over the table.
interface ScreenPicture { tex: THREE.CanvasTexture; cv: HTMLCanvasElement }
function makeScreenPicture(maxAnisotropy: number): ScreenPicture {
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = SCREEN_PX;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Sharp at an angle too (the smart screen is often seen slightly from the side).
  tex.anisotropy = Math.min(16, maxAnisotropy);
  return { tex, cv };
}

function Screen({ labels, people, picture: { tex, cv } }: { labels: MeetingLabels; people: Person[]; picture: ScreenPicture }) {
  const voice = useVoice();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  // The meeting page (the running meeting's name, purpose and time), or the presenter's current page live
  // while someone presents: with the name of whoever wrote each part next to it, the page number, the
  // countdown and raised hands. Painted at most once a
  // frame and only when what it shows changed (checked every second too, for the countdown and the
  // "writing now" tags), and again once the web fonts are ready.
  useEffect(() => {
    let live = true, raf = 0, shown = '', wait: ReturnType<typeof setTimeout> | undefined, last = 0;
    let shownRefs: unknown[] = [];
    const painter = new BoardPainter();
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? null;
    const paint = (force = false) => {
      raf = 0;
      if (!live) return;
      const p = presentation(), who = p.userId;
      const board = who ? boardOf(who) : null;
      const hands = handQueue();
      const left = p.timerEnd ? p.timerEnd - syncedNow() : null;
      const writers = board ? people.filter((x) => writingNow(x.id)).map((x) => x.id).join() : '';
      const elapsed = labels.startedAt ? clockText(Math.max(0, Math.round((syncedNow() - Date.parse(labels.startedAt)) / 1000))) : undefined;
      // Whoever is talking loudest right now (their voice level), if anyone.
      let speaking: string | undefined, loudest = 0.12;
      for (const x of people) { const lv = voiceRef.current.getLevel(x.id); if (lv > loudest) { loudest = lv; speaking = x.name; } }
      const qv = quickVote.get();
      const key = [who, left === null ? '' : clock(left), writers, elapsed, speaking, qv ? JSON.stringify(qv) : ''].join('|');
      const refs = [board, p, hands];
      if (!force && key === shown && refs.every((r, i) => r === shownRefs[i])) return;
      shown = key; shownRefs = refs; last = performance.now();
      if (who && board) {
        painter.paint(cv.getContext('2d')!, onPage(board.items, board.page), cv.width / BOARD_W, () => schedule(true), {
          tags: { owner: who, name: nameOf, color: (id) => colorOf(people, id), active: writingNow }, hot: isHot,
        });
      } else paintScreen(cv, labels);
      paintScreenInfo(cv, {
        presenter: who ? nameOf(who) ?? '' : undefined, page: board && board.pages > 1 ? `${board.page + 1}/${board.pages}` : undefined,
        timer: who && left !== null ? { text: clock(left), late: left < 0, soon: left >= 0 && left < 60_000 } : undefined, elapsed,
        hands: hands.map((id) => nameOf(id) ?? '').filter(Boolean), handsLabel: labels.hands, rtl: labels.rtl,
        speaking, vote: qv ? { question: qv.question, open: qv.open, ...tally(qv) } : undefined,
      });
      tex.needsUpdate = true;
    };
    // While someone draws, the big screen picture is sent to the graphics card about ten times a second, not
    // on every frame: smooth enough to watch, and far less work (and heat) on phones.
    const schedule = (force = false) => {
      if (force) shown = '\0';
      if (raf || wait) return;
      const gap = SCREEN_MIN_MS - (performance.now() - last);
      if (gap > 0) wait = setTimeout(() => { wait = undefined; raf = requestAnimationFrame(() => paint()); }, gap);
      else raf = requestAnimationFrame(() => paint());
    };
    const offBoards = subscribeBoards(() => schedule());
    const offHands = subscribeHands(() => schedule());
    const offVote = subscribeQuickVote(() => schedule());
    const tick = setInterval(() => schedule(), 500);
    paint(true);
    const fam = labels.rtl ? '"Vazirmatn Variable"' : '"Inter Variable"';
    Promise.all([document.fonts.load(`650 64px ${fam}`), document.fonts.load(`400 32px ${fam}`)]).then(() => schedule(true), () => {});
    return () => { live = false; offBoards(); offHands(); offVote(); clearInterval(tick); cancelAnimationFrame(raf); clearTimeout(wait); };
  }, [cv, tex, labels, people]);
  const { width: w, height: h, bottom, z } = CONF_SCREEN;
  return (
    <group position={[0, bottom + h / 2, z]}>
      <mesh material={mat.dark}><boxGeometry args={[w + 0.1, h + 0.1, 0.06]} /></mesh>
      <mesh position-z={0.031}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      <ScreenLasers people={people} w={w} h={h} z={0.036} />
    </group>
  );
}

// Laser pointers on the presented board: a glowing dot per person, in their colour, moved every frame
// (cheaper than repainting the screen).
const LASER_DOTS = 4;
function ScreenLasers({ people, w, h, z, scale = 1 }: { people: Person[]; w: number; h: number; z: number; scale?: number }) {
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: LASER_DOTS }, () => new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, toneMapped: false, depthWrite: false })), []);
  const glowMats = useMemo(() => mats.map(() => new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.3, toneMapped: false, depthWrite: false })), [mats]);
  useFrame(() => {
    const who = presentation().userId;
    const list = who ? lasersOn(who) : [];
    dots.current.forEach((d, i) => {
      if (!d) return;
      const l = list[i];
      d.visible = !!l;
      if (!l) return;
      d.position.set((l.x / BOARD_W - 0.5) * w, (0.5 - l.y / BOARD_H) * h, z);
      const c = colorOf(people, l.by);
      mats[i].color.set(c); glowMats[i].color.set(c);
      const fade = Math.max(0, 1 - Math.max(0, performance.now() - l.at - 600) / 900);
      mats[i].opacity = fade; glowMats[i].opacity = 0.3 * fade;
    });
  });
  useEffect(() => () => { mats.forEach((m) => m.dispose()); glowMats.forEach((m) => m.dispose()); }, [mats, glowMats]);
  return (
    <>
      {mats.map((m, i) => (
        <mesh key={i} ref={(el) => { dots.current[i] = el; }} visible={false} renderOrder={4} material={m} scale={scale}>
          <circleGeometry args={[0.022, 20]} />
          <mesh position-z={-0.001} material={glowMats[i]}><circleGeometry args={[0.055, 24]} /></mesh>
        </mesh>
      ))}
    </>
  );
}

function Credenza() {
  const m = textured();
  const { z, halfWidth: hw, halfDepth: hd, height: h } = CONF_CREDENZA;
  return (
    <group position={[0, 0, z]}>
      <mesh position-y={h / 2 + 0.04} material={m.oak}><boxGeometry args={[hw * 2, h - 0.04, hd * 2]} /></mesh>
      <mesh position={[0, h / 2 + 0.04, hd + 0.002]} material={m.slats}><planeGeometry args={[hw * 2 - 0.12, h - 0.16]} /></mesh>
      <mesh position-y={h + 0.012} material={m.oak}><boxGeometry args={[hw * 2 + 0.06, 0.025, hd * 2 + 0.04]} /></mesh>
    </group>
  );
}

function Ceiling() {
  return (
    <group position-y={WALL_HEIGHT}>
      <mesh position-y={-0.012} rotation-x={Math.PI / 2}><circleGeometry args={[CONF_RADIUS - 0.08, 96]} /><meshStandardMaterial color="#f5ede1" roughness={1} /></mesh>
      <mesh position-y={-0.016} rotation-x={Math.PI / 2} material={lit.disc}><circleGeometry args={[2.4, 96]} /></mesh>
    </group>
  );
}

export function ConferenceRoom({ labels, people, lowQuality }: { labels: MeetingLabels; people: Person[]; lowQuality: boolean }) {
  const m = textured();
  const { gl } = useThree();
  const picture = useMemo(() => makeScreenPicture(gl.capabilities.getMaxAnisotropy()), [gl]);
  useEffect(() => () => picture.tex.dispose(), [picture]);
  const seats = useMemo(() => conferenceSeats(), []);
  const mySeat = useOfficeUi((u) => u.seatId);
  return (
    <group>
      <mesh position-y={0.006} rotation-x={-Math.PI / 2} material={m.carpet}><circleGeometry args={[CONF_RADIUS - 0.02, 96]} /></mesh>
      <Table />
      <StaticParts />
      {seats.filter((s) => s.id === mySeat).map((s) => (
        <group key={s.id} position={[Math.sin(s.facing) * (CONF_TABLE_RADIUS - 0.3), CONF_TABLE_HEIGHT, Math.cos(s.facing) * (CONF_TABLE_RADIUS - 0.3)]} rotation-y={s.facing}>
          <LiveTablet />
        </group>
      ))}
      <Screen labels={labels} people={people} picture={picture} />
      <HoloScreen picture={picture} people={people} />
      <TabletInput />
      <Credenza />
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
      <mesh material={mat.frame}><boxGeometry args={[0.21, 0.31, 0.022]} /></mesh>
      <mesh position-z={0.0115}><planeGeometry args={[0.18, 0.27]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}

// ——— Smart screen over the table ———
// A large floating copy of the meeting screen above the middle of the table, like a hologram but sharp: the
// same picture as the wall screen (presentations, pictures, the meeting page), so small writing can be read
// without zooming. Everyone sees it turned towards themselves (it is drawn on each device for its own
// camera), a little in front of the middle of the table. It is turned on and off from the seat tablet
// ("Smart screen", kept per device) and shows only inside the conference room.

const HOLO_W = 2.2, HOLO_H = HOLO_W * (BOARD_H / BOARD_W); // 16:9, like the screen
const HOLO_BOTTOM = CONF_TABLE_HEIGHT + 0.24;
const HOLO_TOWARD = 0.35; // metres from the middle of the table towards the viewer
const HOLO_CYAN = new THREE.Color('#5fe6ff');
const useHoloOn = () => useSyncExternalStore(tablet.subscribe, () => tablet.get().holo, () => false);

// Soft fade along v (0 at the emitter, 1 at the screen) for the light beam.
const holoTextures = (() => {
  let made: { beam: THREE.CanvasTexture } | null = null;
  return () => {
    if (made) return made;
    const beamCv = document.createElement('canvas');
    beamCv.width = 64; beamCv.height = 128;
    const g = beamCv.getContext('2d')!;
    const v = g.createLinearGradient(0, 128, 0, 0);
    v.addColorStop(0, 'rgba(255,255,255,0.9)'); v.addColorStop(0.5, 'rgba(255,255,255,0.25)'); v.addColorStop(1, 'rgba(255,255,255,0.05)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 128);
    // darker towards the sides of the beam
    const hz = g.createLinearGradient(0, 0, 64, 0);
    hz.addColorStop(0, 'rgba(0,0,0,1)'); hz.addColorStop(0.3, 'rgba(0,0,0,0)'); hz.addColorStop(0.7, 'rgba(0,0,0,0)'); hz.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = hz; g.fillRect(0, 0, 64, 128);
    return (made = { beam: new THREE.CanvasTexture(beamCv) });
  };
})();

// A trapezoid from the emitter (narrow, at the bottom) to the screen's lower edge.
function beamGeometry(bottomW: number, topW: number, height: number, back: number) {
  const g = new THREE.BufferGeometry();
  const p = [-bottomW / 2, 0, -back, bottomW / 2, 0, -back, topW / 2, height, 0, -topW / 2, height, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function HoloScreen({ picture, people }: { picture: ScreenPicture; people: Person[] }) {
  const on = useHoloOn();
  const inRoom = useOfficeUi((u) => u.inConference);
  const show = on && inRoom;
  const group = useRef<THREE.Group>(null);
  const panel = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const grow = useRef(0); // 0..1 while it switches on (and back while it switches off)
  const { camera } = useThree();
  const tx = holoTextures();
  const parts = useMemo(() => ({
    // Fully solid once on, so the picture is as sharp and true in colour as the wall screen.
    content: new THREE.MeshBasicMaterial({ map: picture.tex, toneMapped: false, transparent: true }),
    glass: new THREE.MeshBasicMaterial({ color: HOLO_CYAN, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    edge: new THREE.MeshBasicMaterial({ color: HOLO_CYAN.clone().multiplyScalar(1.6), toneMapped: false, transparent: true, depthWrite: false }),
    beam: new THREE.MeshBasicMaterial({ map: tx.beam, color: HOLO_CYAN, transparent: true, opacity: 0.32, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    emitter: new THREE.MeshBasicMaterial({ color: HOLO_CYAN.clone().multiplyScalar(1.4), toneMapped: false }),
  }), [picture, tx]);
  const beamGeo = useMemo(() => beamGeometry(0.22, HOLO_W * 0.92, HOLO_BOTTOM - CONF_TABLE_HEIGHT + 0.02, HOLO_TOWARD), []);
  useEffect(() => () => { Object.values(parts).forEach((m) => m.dispose()); beamGeo.dispose(); }, [parts, beamGeo]);
  useFrame((_, dt) => {
    const g = group.current, p = panel.current;
    if (!g || !p) return;
    grow.current = Math.max(0, Math.min(1, grow.current + (show ? dt : -dt) * 3.2));
    const k = grow.current;
    g.visible = k > 0;
    if (!k) return;
    // Towards the viewer: a little in front of the middle of the table, turned to face them.
    const cx = camera.position.x, cz = camera.position.z, d = Math.hypot(cx, cz) || 1;
    g.position.set((cx / d) * HOLO_TOWARD, 0, (cz / d) * HOLO_TOWARD);
    g.rotation.y = Math.atan2(cx, cz);
    // The screen tilts a little so it faces the eyes, seated or standing.
    const y = HOLO_BOTTOM + HOLO_H / 2;
    p.position.y = y;
    p.rotation.x = -Math.atan2(camera.position.y - y, Math.max(0.5, d - HOLO_TOWARD)) * 0.6;
    // Switching on: it unfolds from the emitter with a short flicker.
    const flicker = k < 1 ? 0.75 + 0.25 * Math.sin(performance.now() / 18) : 1;
    p.scale.set(0.2 + 0.8 * k, k * k, 1);
    parts.content.opacity = k < 1 ? 0.9 * k * flicker : 1;
    parts.edge.opacity = k;
    parts.glass.opacity = 0.22 * k;
    if (beam.current) beam.current.scale.set(0.2 + 0.8 * k, k, 1);
    parts.beam.opacity = 0.32 * k * flicker;
  });
  const E = 0.012; // edge thickness
  return (
    <group ref={group} visible={false}>
      {/* the emitter in the middle of the planter, and the light rising from it to the screen */}
      <mesh position={[0, CONF_TABLE_HEIGHT + 0.004, -HOLO_TOWARD]} rotation-x={-Math.PI / 2} material={parts.emitter}><ringGeometry args={[0.07, 0.11, 40]} /></mesh>
      <mesh ref={beam} position-y={CONF_TABLE_HEIGHT - 0.01} material={parts.beam} geometry={beamGeo} renderOrder={2} />
      <group ref={panel}>
        {/* a glowing glass rim, its bright edges and the picture itself */}
        <mesh position-z={-0.004} material={parts.glass} renderOrder={2}><planeGeometry args={[HOLO_W + 0.06, HOLO_H + 0.06]} /></mesh>
        <mesh material={parts.content} renderOrder={3}><planeGeometry args={[HOLO_W, HOLO_H]} /></mesh>
        {([[0, HOLO_H / 2 + E, HOLO_W + 4 * E, E], [0, -HOLO_H / 2 - E, HOLO_W + 4 * E, E], [HOLO_W / 2 + E, 0, E, HOLO_H + 2 * E], [-HOLO_W / 2 - E, 0, E, HOLO_H + 2 * E]] as const).map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.001]} material={parts.edge} renderOrder={4}><planeGeometry args={[w, h]} /></mesh>
        ))}
        <ScreenLasers people={people} w={HOLO_W} h={HOLO_H} z={0.006} scale={0.75} />
      </group>
    </group>
  );
}
