'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BatchMeshes } from '../BatchMeshes';
import { neonSign, signFont } from '../textures';
import { WALL_HEIGHT, H, OUT, ARCADES, JUKEBOX, DANCE_FLOOR, GAME_TV, XO_TABLE, FOUNTAIN, GARDEN, areaAt } from '../layout';
import { jukebox } from '../play/jukebox';
import { STYLES } from '../play/music';
import { xo, winnerOf } from '../play/xo';
import { arcadeScores } from '../play/scores';
import { buildCafe, buildGameRoom, buildGarden, buildLibrary, skyColors, ARCADE_SCREEN } from './builders';

// The rooms around the "+": game room (north), café (west), library (east) and the garden outside the
// café. Their fixed parts are merged meshes (builders.ts); here are the few live parts: screens painted
// on canvases, the dance floor's lights, the jukebox's glow and the fountain's water.

export interface RoomLabels {
  cafe: string; library: string; game: string; garden: string; quiet: string;
  arcadeTitle: string; arcadePress: string; scores: string; noScores: string; xoTitle: string; rtl: boolean;
}
export interface Person { id: string; name: string }

const canvasTexture = (w: number, h: number) => {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { cv, g: cv.getContext('2d')!, tex };
};

// A sign with glowing letters, readable from both sides when `both` is set.
function Sign({ text, sub, color, pos, rotY, size = [2.4, 0.6], both = false, board = true }: {
  text: string; sub?: string; color: string; pos: [number, number, number]; rotY: number; size?: [number, number]; both?: boolean; board?: boolean;
}) {
  const tex = useMemo(() => neonSign(text, color, { sub }), [text, sub, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={pos} rotation-y={rotY}>
      {board && <mesh><boxGeometry args={[size[0] + 0.16, size[1] + 0.12, 0.05]} /><meshStandardMaterial color="#1d2a27" roughness={0.8} /></mesh>}
      <mesh position-z={0.03}><planeGeometry args={size} /><meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} /></mesh>
      {both && <mesh position-z={-0.03} rotation-y={Math.PI}><planeGeometry args={size} /><meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} /></mesh>}
    </group>
  );
}

// Both arcade cabinets show the same "attract" screen: a title, a crawling bug and "Press E".
function ArcadeScreens({ labels }: { labels: RoomLabels }) {
  const { cv, g, tex } = useMemo(() => canvasTexture(256, 208), []);
  const last = useRef(0);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ camera }) => {
    const now = performance.now();
    if (now - last.current < 280 || areaAt(camera.position.x, camera.position.z) !== 'game') return;
    last.current = now;
    const t = now / 1000, W = cv.width, Hh = cv.height;
    g.fillStyle = '#0d1030'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = 'rgba(120,140,255,0.12)';
    for (let y = 0; y < Hh; y += 6) g.fillRect(0, y, W, 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = signFont(labels.arcadeTitle, 800, 34); g.fillStyle = '#ffd23f';
    g.fillText(labels.arcadeTitle, W / 2, 44, W - 16);
    g.font = '64px serif';
    g.fillText('🐞', W / 2 + Math.sin(t * 1.7) * 70, 112 + Math.cos(t * 2.3) * 12);
    if (Math.floor(t * 1.6) % 2) { g.font = signFont(labels.arcadePress, 700, 22); g.fillStyle = '#7dffb0'; g.fillText(labels.arcadePress, W / 2, 178, W - 16); }
    tex.needsUpdate = true;
  });
  return (
    <>
      {ARCADES.map((p, i) => (
        <group key={i} position={[p[0], 0, p[1]]} rotation-y={Math.PI / 2}>
          <mesh position={[0, ARCADE_SCREEN.y, ARCADE_SCREEN.z]} rotation-x={ARCADE_SCREEN.tilt}>
            <planeGeometry args={[ARCADE_SCREEN.w, ARCADE_SCREEN.h]} />
            <meshBasicMaterial map={tex} toneMapped={false} color={i ? '#e8f6ff' : '#ffffff'} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// The TV shows the arcade game's best scores.
function GameTv({ labels, people }: { labels: RoomLabels; people: Person[] }) {
  const { cv, g, tex } = useMemo(() => canvasTexture(768, 432), []);
  useEffect(() => {
    const paint = () => {
      const W = cv.width, Hh = cv.height;
      const bg = g.createLinearGradient(0, 0, W, Hh);
      bg.addColorStop(0, '#1b1f4a'); bg.addColorStop(1, '#4a1d5e');
      g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
      g.textBaseline = 'middle'; g.textAlign = 'center';
      g.font = signFont(labels.scores, 800, 46); g.fillStyle = '#ffd23f';
      g.fillText(`🏆  ${labels.scores}`, W / 2, 62, W - 40);
      const rows = Object.entries(arcadeScores.get()).map(([id, score]) => ({ name: people.find((p) => p.id === id)?.name ?? '—', score }))
        .sort((a, b) => b.score - a.score).slice(0, 4);
      if (!rows.length) { g.font = signFont(labels.noScores, 500, 30); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(labels.noScores, W / 2, Hh / 2 + 20, W - 60); }
      rows.forEach((r, i) => {
        const y = 150 + i * 68;
        g.fillStyle = i === 0 ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.09)';
        g.beginPath(); g.roundRect(70, y - 28, W - 140, 56, 16); g.fill();
        g.fillStyle = '#ffffff'; g.font = signFont(r.name, 700, 30);
        g.textAlign = labels.rtl ? 'right' : 'left';
        g.fillText(`${['🥇', '🥈', '🥉', '④'][i]}  ${r.name}`, labels.rtl ? W - 96 : 96, y, W - 320);
        g.textAlign = labels.rtl ? 'left' : 'right'; g.font = '800 32px "Inter Variable", system-ui, sans-serif'; g.fillStyle = '#7dffb0';
        g.fillText(String(r.score), labels.rtl ? 96 : W - 96, y);
        g.textAlign = 'center';
      });
      tex.needsUpdate = true;
    };
    paint();
    document.fonts?.ready.then(paint, () => {});
    return arcadeScores.subscribe(paint);
  }, [cv, g, tex, labels, people]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[GAME_TV.x, GAME_TV.bottom + GAME_TV.height / 2, -OUT + 0.155]}>
      <planeGeometry args={[GAME_TV.width, GAME_TV.height]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

// Dance floor: a 4×4 grid of light tiles (one tiny texture) stepping with the music, and a turning disco ball.
const TILE_COLORS = [[255, 79, 163], [53, 224, 255], [255, 210, 63], [125, 255, 176], [179, 107, 255], [255, 138, 60]];
function DanceFloor() {
  const n = DANCE_FLOOR.tiles;
  const tex = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array(n * n * 4).fill(255), n, n, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [n]);
  const ball = useRef<THREE.Mesh>(null);
  const beat = useRef(-1);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ camera }, dt) => {
    if (camera.position.z > 2) return; // far away on the other side of the office
    const track = jukebox.get();
    if (ball.current) ball.current.rotation.y += dt * (track >= 0 ? 0.9 : 0.15);
    // One step per beat while music plays, a slow drift otherwise.
    const step = Math.floor(performance.now() / (track >= 0 ? 60000 / STYLES[track].bpm : 1600));
    if (step === beat.current) return;
    beat.current = step;
    const data = tex.image.data as Uint8Array;
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = Math.floor(i / n);
      const c = TILE_COLORS[(x * 2 + y * 3 + step * (1 + ((x + y) % 2))) % TILE_COLORS.length];
      const k = track >= 0 ? ((x + y + step) % 3 === 0 ? 1 : 0.5) : 0.32;
      data[i * 4] = c[0] * k; data[i * 4 + 1] = c[1] * k; data[i * 4 + 2] = c[2] * k;
    }
    tex.needsUpdate = true;
  });
  const size = DANCE_FLOOR.half * 2;
  return (
    <>
      <mesh position={[DANCE_FLOOR.pos[0], 0.024, DANCE_FLOOR.pos[1]]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh ref={ball} position={[DANCE_FLOOR.pos[0], WALL_HEIGHT - 0.62, DANCE_FLOOR.pos[1]]}>
        <icosahedronGeometry args={[0.2, 1]} />
        <meshStandardMaterial color="#f2f4ff" metalness={0.9} roughness={0.18} flatShading envMapIntensity={2.5} />
      </mesh>
    </>
  );
}

// The jukebox's light panel breathes while a style plays.
function JukeboxGlow() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffb45c', toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ camera }) => {
    if (camera.position.z > 2) return;
    const track = jukebox.get();
    const pulse = track >= 0 ? 0.75 + 0.45 * Math.abs(Math.sin(performance.now() / (60000 / STYLES[track].bpm) * Math.PI)) : 0.35;
    mat.color.setRGB(1.0 * pulse, 0.62 * pulse, 0.3 * pulse);
  });
  return (
    <group position={[JUKEBOX[0], 0, JUKEBOX[1]]} rotation-y={-Math.PI / 2}>
      <mesh position={[0, 0.52, 0.286]} material={mat}><planeGeometry args={[0.56, 0.3]} /></mesh>
    </group>
  );
}

// The noughts-and-crosses board painted on the game table.
function XoBoard() {
  const { g, tex } = useMemo(() => canvasTexture(256, 256), []);
  useEffect(() => {
    const paint = () => {
      const s = xo.get(), S = 256, c = S / 3;
      g.fillStyle = '#20324a'; g.beginPath(); g.roundRect(0, 0, S, S, 22); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 6; g.lineCap = 'round';
      for (const i of [1, 2]) { g.beginPath(); g.moveTo(i * c, 16); g.lineTo(i * c, S - 16); g.stroke(); g.beginPath(); g.moveTo(16, i * c); g.lineTo(S - 16, i * c); g.stroke(); }
      const w = winnerOf(s.cells);
      s.cells.forEach((m, i) => {
        if (!m) return;
        const x = (i % 3 + 0.5) * c, y = (Math.floor(i / 3) + 0.5) * c, r = c * 0.28;
        const lit = !w || w === 'draw' || w.line.includes(i);
        g.globalAlpha = lit ? 1 : 0.4; g.lineWidth = 13;
        if (m === 1) { g.strokeStyle = '#ff9a4d'; g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
        else { g.strokeStyle = '#4fd8cf'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
        g.globalAlpha = 1;
      });
      tex.needsUpdate = true;
    };
    paint();
    return xo.subscribe(paint);
  }, [g, tex]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[XO_TABLE[0], 0.763, XO_TABLE[1]]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[0.6, 0.6]} />
      <meshBasicMaterial map={tex} toneMapped={false} transparent />
    </mesh>
  );
}

const JET = new THREE.ConeGeometry(0.07, 0.75, 8).translate(0, 0.375, 0);
// The fountain's jet and the rings it makes.
function FountainWater() {
  const jet = useRef<THREE.Mesh>(null), ring = useRef<THREE.Mesh>(null);
  const mats = useMemo(() => ({
    jet: new THREE.MeshBasicMaterial({ color: '#d9f4fb', transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }),
  }), []);
  useEffect(() => () => { mats.jet.dispose(); mats.ring.dispose(); }, [mats]);
  useFrame(({ camera }) => {
    if (camera.position.x > 2) return;
    const t = performance.now() / 1000;
    if (jet.current) jet.current.scale.set(1, 0.85 + Math.sin(t * 5) * 0.08 + Math.sin(t * 13) * 0.04, 1);
    if (ring.current) { const k = (t * 0.5) % 1; ring.current.scale.setScalar(0.25 + k * 0.75); mats.ring.opacity = 0.55 * (1 - k); }
  });
  const [x, z] = FOUNTAIN.pos;
  return (
    <>
      <mesh ref={jet} position={[x, 1.08, z]} material={mats.jet} geometry={JET} />
      <mesh ref={ring} position={[x, 0.44, z]} rotation-x={-Math.PI / 2} material={mats.ring}><ringGeometry args={[FOUNTAIN.r - 0.24, FOUNTAIN.r - 0.16, 32]} /></mesh>
    </>
  );
}

function Sky() {
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(80, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.08);
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) colors.set(skyColors(pos.getY(i) / 55), i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} renderOrder={-1}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} /></mesh>;
}

export function Rooms({ labels, people }: { labels: RoomLabels; people: Person[] }) {
  return (
    <group>
      <BatchMeshes build={buildGameRoom} />
      <BatchMeshes build={buildCafe} />
      <BatchMeshes build={buildLibrary} />
      <BatchMeshes build={buildGarden} />
      <Sky />
      <ArcadeScreens labels={labels} />
      <GameTv labels={labels} people={people} />
      <DanceFloor />
      <JukeboxGlow />
      <XoBoard />
      <FountainWater />
      <Sign text={labels.game} color="#ff4fa3" pos={[2.6, 2.48, -OUT + 0.12]} rotY={0} size={[3.0, 0.75]} board={false} />
      <Sign text={labels.game} color="#b98cff" pos={[0, 2.62, -H + 0.2]} rotY={0} size={[1.9, 0.48]} />
      <Sign text={labels.cafe} color="#ffb45c" pos={[-H - 0.9, 2.55, 0]} rotY={Math.PI / 2} size={[1.9, 0.48]} both />
      <Sign text={labels.library} sub={labels.quiet} color="#8fe0c8" pos={[H + 0.9, 2.5, 0]} rotY={-Math.PI / 2} size={[2.1, 0.62]} both />
      <Sign text={labels.garden} color="#9be27f" pos={[GARDEN.max[0] - 0.9, 1.25, -1.5]} rotY={Math.PI / 2} size={[1.3, 0.36]} both />
      <mesh position={[GARDEN.max[0] - 0.9, 0.55, -1.5]}><boxGeometry args={[0.07, 1.1, 0.07]} /><meshStandardMaterial color="#5c4636" /></mesh>
      {/* Cords of the hanging signs */}
      {[[-H - 0.9, 0], [H + 0.9, 0]].map(([x, z]) => [-0.8, 0.8].map((d) => (
        <mesh key={`${x}${d}`} position={[x, 2.9, z + d]}><boxGeometry args={[0.012, 0.3, 0.012]} /><meshStandardMaterial color="#3a3330" /></mesh>
      )))}
    </group>
  );
}
