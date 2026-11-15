'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHESS_TABLE, CHESS_TABLE_HEIGHT } from './layout';
import { useOfficeUi } from './store';
import { syncedNow } from '@/lib/realtime/room';
import { music } from './play/music';
import { tabletHit } from './tablet';
import { chessGame, type ChessState } from './play/chessGame';
import { colorOf, inCheck, kindOf, kingSquare, legalMoves, type Color, type Move, type Piece } from './play/chess';

// The chess table in the café, played right in the 3D office (unlike the arcade's games): sit on the east
// chair for white or the west chair for black, then click (or tap) a piece on the table and the square it
// goes to. Wooden pieces hop to their squares, a taken piece is knocked off into its taker's tray, the king
// glows red in check and falls over at checkmate, the chess clock counts each side's thinking time and the
// lamp hangs low over the board. Everyone walking by sees the game as it is played, and hears the moves.

const [CX, CZ] = CHESS_TABLE, Y = CHESS_TABLE_HEIGHT + 0.002, S = 0.068;
const KINDS = ['p', 'n', 'b', 'r', 'q', 'k'] as const;
type Kind = (typeof KINDS)[number];
const MAX = 10; // instances per kind and colour (eight pawns, or promoted queens)

/** Where a square's middle is on the table (white sits east, so rank 1 is nearest +x; file a is on white's left, +z). */
export const squareAt = (sq: number): [number, number] => [CX + (3.5 - (sq >> 3)) * S, CZ + (3.5 - (sq & 7)) * S];
/** The square under a point of the table, or -1. */
export function squareFrom(x: number, z: number) {
  const r = Math.floor(4 - (x - CX) / S), f = Math.floor(4 - (z - CZ) / S);
  return r < 0 || r > 7 || f < 0 || f > 7 ? -1 : r * 8 + f;
}
// Taken pieces stand in a row on their taker's right: white's catch south of the board, black's north.
function traySpot(color: Color, k: number): [number, number] {
  const row = Math.floor(k / 8), i = k % 8;
  return color === 'w' ? [CX + 0.06 + i * 0.038, CZ - 0.335 - row * 0.04] : [CX - 0.06 - i * 0.038, CZ + 0.335 + row * 0.04];
}

// ——— Turned wooden pieces ———
const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 24);
const ball = (r: number, y: number) => new THREE.SphereGeometry(r, 16, 12).translate(0, y, 0);
const BASE: [number, number][] = [[0, 0], [0.023, 0], [0.023, 0.005], [0.02, 0.008], [0.016, 0.011]];
function pieceGeometry(k: Kind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  switch (k) {
    case 'p': parts.push(lathe([...BASE, [0.011, 0.024], [0.014, 0.027], [0.007, 0.03], [0, 0.03]]), ball(0.011, 0.038)); break;
    case 'r': parts.push(lathe([...BASE, [0.015, 0.042], [0.019, 0.046], [0.019, 0.058], [0.014, 0.058], [0.014, 0.053], [0, 0.053]])); break;
    case 'b': parts.push(lathe([...BASE, [0.009, 0.04], [0.014, 0.043], [0.008, 0.046], [0.012, 0.052], [0.011, 0.06], [0.006, 0.066], [0, 0.068]]), ball(0.004, 0.071)); break;
    case 'q': parts.push(lathe([...BASE, [0.01, 0.048], [0.016, 0.052], [0.009, 0.055], [0.017, 0.066], [0.013, 0.07], [0, 0.07]]), ball(0.006, 0.075)); break;
    case 'k': {
      parts.push(lathe([...BASE, [0.011, 0.054], [0.017, 0.058], [0.01, 0.061], [0.016, 0.072], [0.012, 0.076], [0, 0.076]]));
      parts.push(new THREE.BoxGeometry(0.005, 0.022, 0.005).translate(0, 0.087, 0), new THREE.BoxGeometry(0.016, 0.005, 0.005).translate(0, 0.089, 0));
      break;
    }
    case 'n': {
      // A horse's head on a turned base, looking along +x (turned towards the other player when placed).
      parts.push(lathe([...BASE, [0.014, 0.018], [0, 0.018]]));
      parts.push(new THREE.BoxGeometry(0.022, 0.036, 0.016).rotateZ(-0.25).translate(-0.003, 0.034, 0));
      parts.push(new THREE.BoxGeometry(0.026, 0.013, 0.014).rotateZ(0.35).translate(0.012, 0.05, 0));
      parts.push(new THREE.BoxGeometry(0.006, 0.01, 0.01).translate(-0.006, 0.06, 0));
      break;
    }
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()));
  g.computeVertexNormals();
  return g;
}

const WOOD = { w: new THREE.MeshStandardMaterial({ color: '#f0e3c8', roughness: 0.45 }), b: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.38 }) };

// ——— Clicking and tapping on the board ———
export const chessHit: { camera: THREE.Camera | null; dom: HTMLCanvasElement | null; seat: Color | null; onSquare: ((sq: number) => void) | null } = { camera: null, dom: null, seat: null, onSquare: null };
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y), hit = new THREE.Vector3();
function squareUnder(ndc: { x: number; y: number } | null) {
  if (!ndc || !chessHit.camera) return -1;
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), chessHit.camera);
  return ray.ray.intersectPlane(plane, hit) ? squareFrom(hit.x, hit.z) : -1;
}
/** A tap or click on the view while seated at the chess table: picks the square there. True when it did. */
export function chessPressAt(ndc: { x: number; y: number } | null) {
  if (!chessHit.seat || !chessHit.onSquare) return false;
  const sq = squareUnder(ndc);
  if (sq < 0) return false;
  tabletHit.pressedAt = performance.now(); // a click on the board does not grab the mouse for looking around
  chessHit.onSquare(sq);
  return true;
}

// ——— What the board shows besides the pieces ———
interface Marks { selected: number; targets: number[]; hover: number }
const local: Marks & { listeners: Set<() => void> } = { selected: -1, targets: [], hover: -1, listeners: new Set() };
const setMarks = (m: Partial<Marks>) => { Object.assign(local, m); local.listeners.forEach((l) => l()); };

/** Picking a piece and its square, from either the mouse or a tap (the seated player's device). */
function pick(sq: number, color: Color) {
  const s = chessGame.get();
  if (s.result || s.pos.turn !== color) { setMarks({ selected: -1, targets: [] }); return; }
  if (local.selected >= 0 && local.targets.includes(sq)) {
    const from = local.selected;
    const promo = kindOf(s.pos.board[from]) === 'p' && ((sq >> 3) === 7 || (sq >> 3) === 0);
    if (promo) { chessPromote.ask({ from, to: sq }); setMarks({ selected: -1, targets: [] }); return; }
    chessGame.move({ from, to: sq }, color);
    setMarks({ selected: -1, targets: [] });
    return;
  }
  if (colorOf(s.pos.board[sq]) === color) {
    setMarks({ selected: sq, targets: legalMoves(s.pos).filter((m) => m.from === sq).map((m) => m.to) });
  } else setMarks({ selected: -1, targets: [] });
}
/** A pawn reaching the last rank waits here for the player's choice (ChessPanel shows the four pieces). */
export const chessPromote = {
  pending: null as Move | null, listeners: new Set<() => void>(),
  ask(m: Move) { this.pending = m; this.listeners.forEach((l) => l()); },
  choose(p: 'q' | 'r' | 'b' | 'n' | null, color: Color) {
    if (p && this.pending) chessGame.move({ ...this.pending, promo: p }, color);
    this.pending = null; this.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; },
};

function paintBoard(c: HTMLCanvasElement, s: ChessState, m: Marks) {
  const g = c.getContext('2d')!, P = c.width / 8;
  const cell = (sq: number) => [(7 - (sq >> 3)) * P, (7 - (sq & 7)) * P] as const;
  for (let sq = 0; sq < 64; sq++) {
    const [x, y] = cell(sq), dark = ((sq >> 3) + (sq & 7)) % 2 === 0;
    g.fillStyle = dark ? '#8a5a3b' : '#ecd5b0'; g.fillRect(x, y, P, P);
    // A little grain in the wood.
    g.fillStyle = dark ? 'rgba(60,30,15,0.12)' : 'rgba(150,100,60,0.08)';
    for (let k = 0; k < 4; k++) g.fillRect(x, y + ((sq * 7 + k * 17) % 60) * (P / 64), P, 2);
  }
  const tint = (sq: number, color: string) => { const [x, y] = cell(sq); g.fillStyle = color; g.fillRect(x, y, P, P); };
  if (s.last) { tint(s.last.from, 'rgba(255,214,90,0.38)'); tint(s.last.to, 'rgba(255,214,90,0.5)'); }
  if (!s.result && inCheck(s.pos)) {
    const [x, y] = cell(kingSquare(s.pos.board, s.pos.turn)), gr = g.createRadialGradient(x + P / 2, y + P / 2, 2, x + P / 2, y + P / 2, P * 0.7);
    gr.addColorStop(0, 'rgba(255,40,40,0.9)'); gr.addColorStop(1, 'rgba(255,40,40,0)');
    g.fillStyle = gr; g.fillRect(x, y, P, P);
  }
  if (m.selected >= 0) tint(m.selected, 'rgba(60,200,120,0.55)');
  for (const t of m.targets) {
    const [x, y] = cell(t);
    g.fillStyle = 'rgba(30,150,90,0.75)';
    g.beginPath();
    if (s.pos.board[t]) { g.lineWidth = P * 0.09; g.strokeStyle = g.fillStyle; g.arc(x + P / 2, y + P / 2, P * 0.42, 0, Math.PI * 2); g.stroke(); }
    else { g.arc(x + P / 2, y + P / 2, P * 0.15, 0, Math.PI * 2); g.fill(); }
  }
  if (m.hover >= 0) { const [x, y] = cell(m.hover); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeRect(x + 2, y + 2, P - 4, P - 4); }
  // Files and ranks along the edges, readable from white's chair.
  g.fillStyle = 'rgba(40,20,10,0.55)'; g.font = `600 ${P * 0.18}px system-ui, sans-serif`; g.textBaseline = 'top';
  for (let i = 0; i < 8; i++) { const [x, y] = cell(i); g.fillText('abcdefgh'[i], x + P * 0.06, y + P * 0.04); }
}

const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function ChessTable() {
  const { camera, gl, scene } = useThree();
  const seatId = useOfficeUi((u) => u.seatId);
  const seat: Color | null = seatId === 'chess-w' ? 'w' : seatId === 'chess-b' ? 'b' : null;
  const made = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8 * S, 8 * S).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    board.position.set(CX, Y, CZ);
    const meshes = {} as Record<string, THREE.InstancedMesh>;
    for (const k of KINDS) for (const c of ['w', 'b'] as const) {
      const m = new THREE.InstancedMesh(pieceGeometry(k), WOOD[c], MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = false; m.frustumCulled = false; m.count = 0;
      m.setColorAt(0, new THREE.Color('#ffffff'));
      meshes[k + c] = m;
    }
    // Chess clock: a small wooden box with a face for each side and a button on top for each.
    const clockCv = document.createElement('canvas'); clockCv.width = 256; clockCv.height = 96;
    const clockTex = new THREE.CanvasTexture(clockCv); clockTex.colorSpace = THREE.SRGBColorSpace;
    const clockG = new THREE.Group(); clockG.position.set(CX, Y, CZ + 0.355);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.5 })); body.position.y = 0.03;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.045), new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false })); face.position.set(0, 0.032, -0.0255); face.rotation.y = Math.PI;
    const btnMat = { w: new THREE.MeshStandardMaterial({ color: '#d9d2c6' }), b: new THREE.MeshStandardMaterial({ color: '#d9d2c6' }) };
    const btnW = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 12), btnMat.w); btnW.position.set(0.04, 0.066, 0);
    const btnB = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 12), btnMat.b); btnB.position.set(-0.04, 0.066, 0);
    clockG.add(body, face, btnW, btnB);
    const root = new THREE.Group();
    root.add(board, clockG, ...Object.values(meshes));
    return { cv, tex, board, meshes, clockCv, clockTex, clockG, btnW, btnB, root };
  }, []);
  useEffect(() => {
    scene.add(made.root);
    return () => {
      scene.remove(made.root);
      made.root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); if (m.material && !Object.values(WOOD).includes(m.material as THREE.MeshStandardMaterial)) (m.material as THREE.Material).dispose(); });
      made.tex.dispose(); made.clockTex.dispose();
    };
  }, [made, scene]);

  // Moves of the game animate: the piece hops to its square, a taken piece tumbles into its tray.
  const anim = useRef<{ game: number; moves: number; at: number; from: number; to: number; rookFrom: number; rookTo: number; taken: { piece: Piece; from: number; slot: number } | null; fallAt: number }>({ game: -1, moves: 0, at: 0, from: -1, to: -1, rookFrom: -1, rookTo: -1, taken: null, fallAt: 0 });
  const paintKey = useRef('');
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler(), c: new THREE.Color() }), []);

  // Seated: clicks pick squares (the crosshair while looking around, else the cursor); the square under the pointer is outlined.
  const mouse = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    chessHit.camera = camera; chessHit.dom = gl.domElement; chessHit.seat = seat;
    chessHit.onSquare = seat ? (sq) => pick(sq, seat) : null;
    if (!seat) { setMarks({ selected: -1, targets: [], hover: -1 }); return; }
    const el = gl.domElement;
    const toNdc = (x: number, y: number) => { const r = el.getBoundingClientRect(); return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 }; };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      chessPressAt(document.pointerLockElement === el ? { x: 0, y: 0 } : toNdc(e.clientX, e.clientY));
    };
    const move = (e: MouseEvent) => { mouse.current = { x: e.clientX, y: e.clientY }; };
    el.addEventListener('pointerdown', down); window.addEventListener('mousemove', move);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('mousemove', move); chessHit.seat = null; chessHit.onSquare = null; setMarks({ selected: -1, targets: [], hover: -1 }); };
  }, [seat, camera, gl]);
  useEffect(() => { const l = () => { paintKey.current = ''; }; local.listeners.add(l); return () => { local.listeners.delete(l); }; }, []);
  // Test hook used by screenshot scripts: where a square (e.g. 'e2') is on the screen.
  useEffect(() => {
    (window as unknown as { __gcChessAt?: unknown }).__gcChessAt = (name: string) => {
      const sq = (Number(name[1]) - 1) * 8 + 'abcdefgh'.indexOf(name[0]), [x, z] = squareAt(sq);
      const p = new THREE.Vector3(x, Y, z).project(camera), r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
  }, [camera, gl]);

  useFrame(() => {
    const near = Math.hypot(camera.position.x - CX, camera.position.z - CZ) < 14;
    made.root.visible = near;
    if (!near) return;
    const s = chessGame.get(), now = performance.now();
    // Hover (seated, with a mouse).
    if (seat && chessHit.camera) {
      const el = gl.domElement, locked = document.pointerLockElement === el;
      const r = el.getBoundingClientRect(), mm = mouse.current;
      const ndc = locked ? { x: 0, y: 0 } : mm ? { x: ((mm.x - r.left) / r.width) * 2 - 1, y: -((mm.y - r.top) / r.height) * 2 + 1 } : null;
      const h = squareUnder(ndc);
      if (h !== local.hover) { local.hover = h; paintKey.current = ''; }
    }
    // A new move: start its animation and its sound (fainter further away).
    const a = anim.current;
    if (s.game !== a.game) { a.game = s.game; a.moves = s.sans.length; a.at = 0; a.taken = null; a.fallAt = 0; setMarks({ selected: -1, targets: [] }); }
    else if (s.sans.length !== a.moves && s.last) {
      a.moves = s.sans.length; a.at = now; a.from = s.last.from; a.to = s.last.to; a.rookFrom = a.rookTo = -1;
      const pc = s.pos.board[s.last.to];
      if (kindOf(pc) === 'k' && Math.abs(s.last.to - s.last.from) === 2) { const kingSide = s.last.to > s.last.from; a.rookFrom = kingSide ? s.last.from + 3 : s.last.from - 4; a.rookTo = kingSide ? s.last.from + 1 : s.last.from - 1; }
      const lastSan = s.sans[s.sans.length - 1] ?? '';
      a.taken = lastSan.includes('x') && s.captured.length ? { piece: s.captured[s.captured.length - 1], from: s.last.to, slot: s.captured.filter((x) => colorOf(x) === colorOf(s.captured[s.captured.length - 1])).length - 1 } : null;
      const d = Math.hypot(camera.position.x - CX, camera.position.z - CZ), vol = Math.max(0, 1 - d / 9);
      if (vol > 0.02) {
        music().blip(a.taken ? [50, 45] : [79], a.taken ? 'triangle' : 'square', (a.taken ? 0.16 : 0.07) * vol, 0.05);
        if (lastSan.endsWith('+')) setTimeout(() => music().blip([88, 93], 'sine', 0.1 * vol, 0.12), 180);
        if (lastSan.endsWith('#')) setTimeout(() => music().blip([72, 76, 79, 84], 'triangle', 0.12 * vol, 0.14), 250);
      }
      paintKey.current = '';
    }
    if (s.result?.reason === 'mate' && !a.fallAt) a.fallAt = now + 450;
    if (!s.result) a.fallAt = 0;

    // Board picture: repainted only when what it shows changes.
    const pk = `${s.game}:${s.sans.length}:${local.selected}:${local.targets.join(',')}:${local.hover}:${s.result ? 1 : 0}`;
    if (pk !== paintKey.current) { paintKey.current = pk; paintBoard(made.cv, s, local); made.tex.needsUpdate = true; }

    // Pieces.
    const counts: Record<string, number> = {};
    const put = (pc: Piece, x: number, z: number, lift = 0, tilt = 0, tiltDir = 0, tint: string | null = null, scale = 1) => {
      const c = colorOf(pc)!, k = kindOf(pc) as Kind, key = k + c, i = counts[key] ?? 0;
      if (i >= MAX) return;
      counts[key] = i + 1;
      const face = c === 'w' ? Math.PI : 0; // knights look at the other player
      tmp.e.set(0, face, 0); tmp.q.setFromEuler(tmp.e);
      if (tilt) tmp.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(tiltDir), 0, Math.sin(tiltDir)), tilt));
      tmp.m.compose(tmp.p.set(x, Y + lift, z), tmp.q, tmp.s.setScalar(scale));
      made.meshes[key].setMatrixAt(i, tmp.m);
      made.meshes[key].setColorAt(i, tmp.c.set(tint ?? '#ffffff'));
    };
    const t = a.at ? Math.min(1, (now - a.at) / 380) : 1, ease = t * t * (3 - 2 * t);
    const checked = !s.result && inCheck(s.pos) ? kingSquare(s.pos.board, s.pos.turn) : -1;
    const fallen = s.result?.reason === 'mate' ? kingSquare(s.pos.board, s.pos.turn) : -1;
    s.pos.board.forEach((pc, sq) => {
      if (!pc) return;
      let [x, z] = squareAt(sq), lift = 0;
      const moving = t < 1 ? (sq === a.to ? a.from : sq === a.rookTo ? a.rookFrom : -1) : -1;
      if (moving >= 0) {
        const [fx, fz] = squareAt(moving);
        x = fx + (x - fx) * ease; z = fz + (z - fz) * ease;
        lift = Math.sin(Math.PI * t) * (kindOf(pc) === 'n' ? 0.07 : 0.035);
      }
      let tilt = 0, tint: string | null = null;
      if (sq === checked) tint = `#ff${Math.round(70 + 60 * Math.sin(now / 160)).toString(16).padStart(2, '0')}50`;
      if (sq === fallen && a.fallAt) {
        const k = Math.min(1, Math.max(0, (now - a.fallAt) / 700));
        tilt = (Math.PI / 2 - 0.12) * (k * k); tint = '#ff9a90';
      }
      put(pc, x, z, lift, tilt, sq & 1 ? 0.6 : 2.4, tint);
    });
    // Taken pieces in the trays; the newest tumbles there from its square.
    const seen = { w: 0, b: 0 };
    s.captured.forEach((pc, i) => {
      const taker: Color = colorOf(pc) === 'w' ? 'b' : 'w';
      const slot = seen[taker]++;
      let [x, z] = traySpot(taker, slot), lift = 0, tilt = 0;
      if (i === s.captured.length - 1 && a.taken && t < 1.6) {
        const k = Math.min(1, (now - a.at) / 650), [fx, fz] = squareAt(a.taken.from);
        x = fx + (x - fx) * k; z = fz + (z - fz) * k; lift = Math.sin(Math.PI * k) * 0.09; tilt = k < 1 ? k * Math.PI * 2 : 0;
      }
      put(pc, x, z, lift, tilt, 1.1, null, 0.8);
    });
    for (const k of KINDS) for (const c of ['w', 'b'] as const) {
      const m = made.meshes[k + c];
      m.count = counts[k + c] ?? 0; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Clock: each side's thinking time; the side to move is lit and its button is up.
    const live = !s.result && s.turnAt ? Math.max(0, syncedNow() - s.turnAt) : 0;
    const wt = s.used[0] + (s.pos.turn === 'w' ? live : 0), bt = s.used[1] + (s.pos.turn === 'b' ? live : 0);
    const ck = `${clock(wt)}|${clock(bt)}|${s.pos.turn}|${!!s.result}`;
    if (made.clockCv.dataset.k !== ck) {
      made.clockCv.dataset.k = ck;
      const g = made.clockCv.getContext('2d')!;
      g.fillStyle = '#10131a'; g.fillRect(0, 0, 256, 96);
      // As seen from the board (the face looks at it): black's half on the left, white's on the right.
      for (const [side, x0, txt] of [['b', 0, clock(bt)], ['w', 128, clock(wt)]] as const) {
        const on = !s.result && s.pos.turn === side;
        g.fillStyle = on ? '#1e3b2b' : '#151922'; g.fillRect(x0 + 4, 4, 120, 88);
        g.fillStyle = on ? '#7dffb0' : '#8a93a6'; g.font = '700 40px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(txt, x0 + 64, 52);
        g.fillStyle = side === 'w' ? '#f0e3c8' : '#5a4434'; g.fillRect(x0 + 50, 10, 28, 8);
      }
      made.clockTex.needsUpdate = true;
    }
    made.btnW.position.y = s.pos.turn === 'w' && !s.result ? 0.069 : 0.064;
    made.btnB.position.y = s.pos.turn === 'b' && !s.result ? 0.069 : 0.064;
  });
  return null;
}
