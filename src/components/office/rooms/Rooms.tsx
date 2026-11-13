'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BatchMeshes } from '../BatchMeshes';
import { neonSign, signFont } from '../textures';
import { WALL_HEIGHT, H, OUT, NOTICE_KIOSK, ARCADES, JUKEBOX, DANCE_FLOOR, GAME_TV, XO_TABLE, FOUNTAIN, GARDEN, HALL_CABINETS, HALL_SCREEN, ZEN_POND, GATE, areaAt } from '../layout';
import { jukebox } from '../play/jukebox';
import { STYLES } from '../play/music';
import { xo, winnerOf } from '../play/xo';
import { arcadeScores } from '../play/arcade/scores';
import { league, ranking, GAME_IDS, type GameId } from '@/lib/arcade';
import { gameDef } from '../play/arcade/registry';
import { buildCafe, buildReception, buildGameRoom, buildGarden, buildLibrary, buildHall, buildZen, buildLab, skyColors, ARCADE_SCREEN } from './builders';

// The rooms around the "+": game room (north), café (west), library (east) and the garden outside the
// café. Their fixed parts are merged meshes (builders.ts); here are the few live parts: screens painted
// on canvases, the dance floor's lights, the jukebox's glow and the fountain's water.

export interface Notice { news: string | null; newsBy: string; standups: number; members: number; kudos: [string, string] | null }
export interface RoomLabels {
  noticeTitle: string; noticeEmpty: string; noticeStandups: string; notice: Notice;
  cafe: string; library: string; game: string; garden: string; quiet: string;
  arcadeTitle: string; arcadePress: string; scores: string; noScores: string; xoTitle: string; rtl: boolean;
  hall: string; zen: string; lab: string; points: string; games: Record<string, string>;
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

// The league table, painted on a canvas: the game room's TV and the arcade hall's big screen. `leaders`
// adds the record holder of each game beside it (the big screen is wide enough).
function paintLeague(g: CanvasRenderingContext2D, W: number, Hh: number, labels: RoomLabels, people: Person[], leaders: boolean) {
  const bg = g.createLinearGradient(0, 0, W, Hh);
  bg.addColorStop(0, '#1b1f4a'); bg.addColorStop(1, '#4a1d5e');
  g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  const rows = arcadeScores.get(), name = (id: string) => people.find((p) => p.id === id)?.name ?? '—';
  const table = league(rows, people.map((p) => p.id)).filter((r) => r.points > 0).slice(0, 4);
  const left = leaders ? W * 0.5 : W;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = signFont(labels.scores, 800, 44); g.fillStyle = '#ffd23f';
  g.fillText(`🏆  ${labels.scores}`, left / 2, 56, left - 40);
  if (!table.length) { g.font = signFont(labels.noScores, 500, 28); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(labels.noScores, left / 2, Hh / 2 + 20, left - 60); }
  table.forEach((r, i) => {
    const y = 132 + i * 64, x0 = 40, x1 = left - 40;
    g.fillStyle = i === 0 ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.09)';
    g.beginPath(); g.roundRect(x0, y - 27, x1 - x0, 54, 16); g.fill();
    g.fillStyle = '#ffffff'; g.font = signFont(name(r.userId), 700, 28);
    g.textAlign = labels.rtl ? 'right' : 'left';
    g.fillText(`${['🥇', '🥈', '🥉', '④'][i]}  ${name(r.userId)}`, labels.rtl ? x1 - 22 : x0 + 22, y, x1 - x0 - 190);
    g.textAlign = labels.rtl ? 'left' : 'right'; g.font = '800 30px "Inter Variable", system-ui, sans-serif'; g.fillStyle = '#7dffb0';
    g.fillText(String(r.points), labels.rtl ? x0 + 24 : x1 - 24, y);
    g.textAlign = 'center';
  });
  if (!leaders) return;
  // Record holders of the games played so far.
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(left, 30, 3, Hh - 60);
  const best = GAME_IDS.flatMap((id: GameId) => { const top = ranking(rows, id)[0]; return top ? [{ id, top }] : []; }).slice(0, 10);
  best.forEach((b, i) => {
    const col = i % 2, row = Math.floor(i / 2), x = left + 24 + col * ((W - left - 40) / 2), y = 60 + row * 62, w = (W - left - 64) / 2;
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.roundRect(x, y - 26, w, 52, 14); g.fill();
    g.textAlign = 'left'; g.font = '30px serif'; g.fillStyle = '#ffffff'; g.fillText(gameDef(b.id)?.icon ?? '🎮', x + 10, y);
    g.font = signFont(labels.games[b.id] ?? b.id, 700, 18); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(labels.games[b.id] ?? b.id, x + 52, y - 11, w - 60);
    g.font = signFont(name(b.top.userId), 800, 20); g.fillStyle = '#ffd23f'; g.fillText(`${name(b.top.userId)} · ${b.top.best}`, x + 52, y + 13, w - 60);
  });
  g.textAlign = 'center';
}

function LeagueScreen({ labels, people, w, h, pos, size, leaders, near }: {
  labels: RoomLabels; people: Person[]; w: number; h: number; pos: [number, number, number]; size: [number, number]; leaders: boolean; near: (x: number, z: number) => boolean;
}) {
  const { cv, g, tex } = useMemo(() => canvasTexture(w, h), [w, h]);
  const stale = useRef(true);
  // Painted when the records change, but only while someone could see it (near the rooms).
  useEffect(() => { stale.current = true; return arcadeScores.subscribe(() => { stale.current = true; }); }, [labels, people]);
  useEffect(() => { document.fonts?.ready.then(() => { stale.current = true; }, () => {}); }, []);
  useFrame(({ camera }) => {
    if (!stale.current || !near(camera.position.x, camera.position.z)) return;
    stale.current = false;
    paintLeague(g, cv.width, cv.height, labels, people, leaders);
    tex.needsUpdate = true;
  });
  useEffect(() => () => tex.dispose(), [tex]);
  return <mesh position={pos}><planeGeometry args={size} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>;
}
const nearGames = (x: number, z: number) => z < -H + 1 && Math.abs(x) < H + 1;

// The hall's cabinets: all their screens are cells of one texture on one merged mesh (a single draw call),
// each with its game's icon, name and "Press E".
function CabinetScreens({ labels }: { labels: RoomLabels }) {
  const cols = 3, cw = 256, ch = 208, n = HALL_CABINETS.length, rows = Math.ceil(n / cols);
  const { cv, g, tex } = useMemo(() => canvasTexture(cols * cw, rows * ch), [rows]);
  const geometry = useMemo(() => {
    const parts = HALL_CABINETS.map((c, i) => {
      const p = new THREE.PlaneGeometry(ARCADE_SCREEN.w, ARCADE_SCREEN.h);
      const uv = p.attributes.uv as THREE.BufferAttribute, cx = i % cols, cy = Math.floor(i / cols);
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k)) / cols, 1 - (cy + 1 - uv.getY(k)) / rows);
      p.rotateX(ARCADE_SCREEN.tilt);
      p.translate(0, ARCADE_SCREEN.y, ARCADE_SCREEN.z);
      p.rotateY(c.facing);
      p.translate(c.pos[0], 0, c.pos[1]);
      return p;
    });
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return merged;
  }, [rows]);
  useEffect(() => {
    const paint = () => {
      HALL_CABINETS.forEach((c, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, color = gameDef(c.game)?.color ?? '#9b6bff';
        const bg = g.createLinearGradient(0, y, 0, y + ch);
        bg.addColorStop(0, '#0d1030'); bg.addColorStop(1, '#1d1450');
        g.fillStyle = bg; g.fillRect(x, y, cw, ch);
        g.fillStyle = 'rgba(120,140,255,0.1)'; for (let k = y; k < y + ch; k += 6) g.fillRect(x, k, cw, 2);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ffffff'; g.font = '70px serif'; g.fillText(gameDef(c.game)?.icon ?? '🎮', x + cw / 2, y + 70);
        const name = labels.games[c.game] ?? c.game;
        g.font = signFont(name, 800, 28); g.fillStyle = color; g.fillText(name, x + cw / 2, y + 134, cw - 16);
        g.font = signFont(labels.arcadePress, 700, 17); g.fillStyle = '#7dffb0'; g.fillText(labels.arcadePress, x + cw / 2, y + 184, cw - 16);
      });
      tex.needsUpdate = true;
    };
    paint();
    document.fonts?.ready.then(paint, () => {});
  }, [cv, g, tex, labels, rows]);
  useEffect(() => () => { tex.dispose(); geometry.dispose(); }, [tex, geometry]);
  return <mesh geometry={geometry}><meshBasicMaterial map={tex} toneMapped={false} /></mesh>;
}

// Rings spreading on the zen pond.
function PondRipples() {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ camera }) => {
    if (camera.position.x > -OUT + 1) return;
    const k = (performance.now() / 2600) % 1;
    if (ring.current) ring.current.scale.setScalar(0.15 + k * 0.8);
    mat.opacity = 0.5 * (1 - k);
  });
  return <mesh ref={ring} position={[ZEN_POND.pos[0] + 0.2, 0.13, ZEN_POND.pos[1] - 0.1]} rotation-x={-Math.PI / 2} material={mat}><ringGeometry args={[ZEN_POND.r - 0.1, ZEN_POND.r, 32]} /></mesh>;
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

// Lines of `text` that fit `width`, at most `max` (the last one ends with … when cut).
function wrap(g: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' '), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width <= width || !line) line = next; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = `${lines[max - 1].replace(/.{2}$/, '')}…`; }
  return lines;
}

// The notice kiosk in the reception: the team pulse at a glance (announcement, today's standups, latest kudos).
function NoticeKiosk({ labels }: { labels: RoomLabels }) {
  const { cv, g, tex } = useMemo(() => canvasTexture(768, 512), []);
  useEffect(() => {
    const paint = () => {
      const W = cv.width, Hh = cv.height, n = labels.notice, rtl = labels.rtl, edge = rtl ? W - 44 : 44;
      const bg = g.createLinearGradient(0, 0, 0, Hh);
      bg.addColorStop(0, '#1f4a3c'); bg.addColorStop(1, '#16332a');
      g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
      g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#ffd98a'; g.font = signFont(labels.noticeTitle, 800, 44);
      g.fillText(`📌 ${labels.noticeTitle}`, edge, 58, W - 88);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(44, 100, W - 88, 3);
      const body = n.news ?? labels.noticeEmpty;
      g.fillStyle = n.news ? '#ffffff' : 'rgba(255,255,255,0.6)'; g.font = signFont(body, 600, 36);
      wrap(g, body, W - 88, 4).forEach((line, i) => g.fillText(line, edge, 152 + i * 50, W - 88));
      if (n.news && n.newsBy) { g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = signFont(n.newsBy, 500, 26); g.fillText(`— ${n.newsBy}`, edge, 362, W - 88); }
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.roundRect(32, 404, W - 64, 84, 18); g.fill();
      g.fillStyle = '#9be2c4'; g.font = signFont(labels.noticeStandups, 700, 30);
      g.fillText(`🗒 ${labels.noticeStandups}`, edge, 446, n.kudos ? W / 2 - 40 : W - 88);
      if (n.kudos) {
        g.textAlign = rtl ? 'left' : 'right'; g.fillStyle = '#ffd98a';
        g.fillText(`🙏 ${n.kudos[0]} ${rtl ? '←' : '→'} ${n.kudos[1]}`, rtl ? 44 : W - 44, 446, W / 2 - 40);
      }
      g.direction = 'ltr';
      tex.needsUpdate = true;
    };
    paint();
    document.fonts?.ready.then(paint, () => {});
  }, [cv, g, tex, labels]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={[NOTICE_KIOSK.pos[0], 0, NOTICE_KIOSK.pos[1]]} rotation-y={NOTICE_KIOSK.rot}>
      <mesh position={[0, 1.42, 0.032]}><planeGeometry args={[1.2, 0.8]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
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
      <BatchMeshes build={buildReception} />
      <BatchMeshes build={buildGameRoom} />
      <BatchMeshes build={buildCafe} />
      <BatchMeshes build={buildLibrary} />
      <BatchMeshes build={buildGarden} />
      <Sky />
      <BatchMeshes build={buildHall} />
      <BatchMeshes build={buildZen} />
      <BatchMeshes build={buildLab} />
      <ArcadeScreens labels={labels} />
      <CabinetScreens labels={labels} />
      <LeagueScreen labels={labels} people={people} w={768} h={432} size={[GAME_TV.width, GAME_TV.height]} leaders={false} near={nearGames}
        pos={[GAME_TV.x, GAME_TV.bottom + GAME_TV.height / 2, -OUT + 0.155]} />
      <LeagueScreen labels={labels} people={people} w={1280} h={474} size={[HALL_SCREEN.width, HALL_SCREEN.height]} leaders near={nearGames}
        pos={[HALL_SCREEN.x, HALL_SCREEN.bottom + HALL_SCREEN.height / 2, HALL_SCREEN.z + 0.005]} />
      <PondRipples />
      <DanceFloor />
      <JukeboxGlow />
      <XoBoard />
      <FountainWater />
      <NoticeKiosk labels={labels} />
      <Sign text={labels.game} color="#ff4fa3" pos={[4.6, 2.5, -OUT + 0.12]} rotY={0} size={[2.6, 0.62]} board={false} />
      <Sign text={labels.hall} color="#ffd23f" pos={[0, 2.22, -OUT + 0.2]} rotY={0} size={[2.2, 0.5]} both />
      <Sign text={labels.zen} color="#9be2c4" pos={[GATE.x, 2.0, -H]} rotY={0} size={[1.5, 0.38]} both />
      <Sign text={labels.lab} color="#ffd98a" pos={[GATE.x, 2.0, H]} rotY={0} size={[1.5, 0.38]} both />
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
