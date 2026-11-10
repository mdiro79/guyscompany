'use client';
import type { Batch } from '../batch';
import {
  WALL_HEIGHT, H, OUT, GAME_WALL, ARCADES, JUKEBOX, DANCE_FLOOR, GAME_TV, XO_TABLE, BEAN_BAGS,
  CAFE_BAR, CAFE_TABLES, CAFE_TABLE_RADIUS, CAFE_TABLE_HEIGHT, CAFE_STOOLS, WATER_COOLER,
  LIB_SHELVES, LIB_SHELF, LIB_TABLE, LIB_PODS, GARDEN, FOUNTAIN, GARDEN_TREES, GARDEN_BENCHES,
} from '../layout';

// The furniture and decoration of the rooms around the "+", drawn from boxes, cylinders and spheres in
// code and merged per room (batch.ts): no downloads, a few draw calls each.

const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const OAK = '#e2c59a', DARK = '#1c1d2b', TRIM = '#3a3330', ORANGE = '#f08a3c', TEAL = '#3fb3ad', WARM: [number, number, number] = [1.6, 1.35, 0.95];
const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

// ——— Game room ———
export const ARCADE_COLORS = ['#e0457b', '#2bb6c9'];
export const ARCADE_SCREEN = { y: 1.36, z: 0.096, tilt: -0.12, w: 0.52, h: 0.42 };

// An arcade cabinet standing at the origin with its front towards +Z.
function arcade(b: Batch, color: string) {
  b.box([0.7, 0.95, 0.66], [0, 0.475, -0.03], color);
  b.box([0.72, 0.1, 0.68], [0, 0.05, -0.03], DARK);
  b.slab([0.7, 0.06, 0.36], [0, 0.985, 0.19], [0.2, 0, 0], DARK);
  b.box([0.7, 0.78, 0.42], [0, 1.39, -0.15], color);
  b.slab([0.62, 0.52, 0.03], [0, ARCADE_SCREEN.y, 0.075], [ARCADE_SCREEN.tilt, 0, 0], DARK);
  b.box([0.72, 0.18, 0.48], [0, 1.86, -0.12], DARK);
  b.box([0.62, 0.11, 0.012], [0, 1.86, 0.125], color, 0, 'glow', 1.5);
  b.cyl(0.012, 0.012, 0.08, [-0.17, 1.05, 0.2], '#d0d0d8', 8);
  b.sphere(0.03, [-0.17, 1.1, 0.2], '#e23b3b', 8);
  ['#ffd23f', '#5be37a', '#5aa9ff'].forEach((c, i) => b.cyl(0.022, 0.022, 0.014, [0.04 + i * 0.075, 1.022 - i * 0.002, 0.2], c, 10, 'glow', 1.2));
  // Light stripes down both sides.
  for (const s of [-1, 1]) b.box([0.012, 1.5, 0.05], [s * 0.357, 0.95, 0.12], '#ffffff', 0, 'glow', 1.1);
}

export function buildGameRoom(b: Batch) {
  const zN = -OUT + 0.09, zc = -(H + OUT) / 2;
  // Indigo panelling over the side walls, a light strip under the ceiling.
  for (const s of [-1, 1]) {
    b.box([0.04, WALL_HEIGHT, OUT - H - 0.1], [s * (H - 0.1), WALL_HEIGHT / 2, zc], GAME_WALL);
    b.box([0.03, 0.04, OUT - H - 0.3], [s * (H - 0.14), WALL_HEIGHT - 0.12, zc], '#b36bff', 0, 'glow', 1.4);
  }
  b.box([2 * H - 0.3, 0.04, 0.03], [0, WALL_HEIGHT - 0.12, zN + 0.02], '#b36bff', 0, 'glow', 1.4);
  ARCADES.forEach((p, i) => { b.push([p[0], 0, p[1]], Math.PI / 2); arcade(b, ARCADE_COLORS[i % 2]); b.pop(); });
  // Neon bars above the arcades.
  [['#ff4fa3', 1.7, 2.62], ['#35e0ff', 1.2, 2.44], ['#ffd23f', 0.8, 2.26]].forEach(([c, len, y]) => b.box([0.03, 0.035, len as number], [-H + 0.14, y as number, -9.35], c as string, 0, 'glow', 1.6));

  // Jukebox: a wooden body with a round top, a record window and a speaker (its light panel is drawn live).
  b.push([JUKEBOX[0], 0, JUKEBOX[1]], -Math.PI / 2);
  b.box([0.8, 1.0, 0.56], [0, 0.5, 0], '#7a4a2e');
  b.cyl(0.4, 0.4, 0.56, [0, 1.0, 0], '#7a4a2e', 20, 'matte', 1, [Math.PI / 2, 0, 0]);
  b.cyl(0.345, 0.345, 0.02, [0, 1.0, 0.285], '#ff5fa2', 24, 'glow', 1.3, [Math.PI / 2, 0, 0]);
  b.cyl(0.27, 0.27, 0.02, [0, 1.0, 0.292], '#15131c', 24, 'matte', 1, [Math.PI / 2, 0, 0]);
  b.cyl(0.16, 0.16, 0.02, [0, 1.0, 0.298], '#2a2733', 20, 'matte', 1, [Math.PI / 2, 0, 0]);
  b.cyl(0.05, 0.05, 0.02, [0, 1.0, 0.304], ORANGE, 12, 'matte', 1, [Math.PI / 2, 0, 0]);
  b.box([0.52, 0.22, 0.02], [0, 0.2, 0.285], '#2a2019');
  for (const s of [-1, 1]) b.box([0.04, 1.0, 0.03], [s * 0.38, 0.5, 0.275], '#e8d9a8');
  b.pop();

  // Dance floor frame (the tiles are lit live) and the disco ball's cord.
  b.box([DANCE_FLOOR.half * 2 + 0.16, 0.016, DANCE_FLOOR.half * 2 + 0.16], [DANCE_FLOOR.pos[0], 0.014, DANCE_FLOOR.pos[1]], '#11121f');
  b.cyl(0.008, 0.008, 0.45, [DANCE_FLOOR.pos[0], WALL_HEIGHT - 0.225, DANCE_FLOOR.pos[1]], '#888888', 6);

  // TV frame on the north wall.
  b.box([GAME_TV.width + 0.1, GAME_TV.height + 0.1, 0.06], [GAME_TV.x, GAME_TV.bottom + GAME_TV.height / 2, zN + 0.03], '#14151c');

  // Game table for noughts and crosses.
  b.cyl(0.3, 0.3, 0.03, [XO_TABLE[0], 0.015, XO_TABLE[1]], TRIM, 18);
  b.cyl(0.06, 0.06, 0.72, [XO_TABLE[0], 0.38, XO_TABLE[1]], TRIM, 10);
  b.cyl(0.52, 0.52, 0.04, [XO_TABLE[0], 0.74, XO_TABLE[1]], OAK, 28);

  BEAN_BAGS.forEach((p, i) => b.sphere(0.45, [p[0], 0.26, p[1]], i ? TEAL : ORANGE, 14, 'matte', 1, [1, 0.6, 1]));
  // Trophy shelf on the east wall.
  b.box([0.22, 0.04, 1.2], [H - 0.23, 1.55, -9.6], OAK);
  [-0.4, 0, 0.4].forEach((d, i) => {
    const c = ['#e9c46a', '#c9ced6', '#d08c4f'][i];
    b.cyl(0.05, 0.035, 0.03, [H - 0.23, 1.585, -9.6 + d], c, 10).cyl(0.012, 0.012, 0.08, [H - 0.23, 1.64, -9.6 + d], c, 6).cyl(0.06, 0.03, 0.1, [H - 0.23, 1.73, -9.6 + d], c, 12);
  });
  // Posters on the north wall.
  [[2.2, '#ff7a59'], [3.3, '#59c3ff'], [5.6, '#ffd166']].forEach(([x, c]) => {
    b.box([0.78, 1.05, 0.03], [x as number, 1.7, zN], '#0f1018').box([0.68, 0.95, 0.035], [x as number, 1.7, zN + 0.004], c as string);
    b.cyl(0.2, 0.2, 0.012, [x as number, 1.8, zN + 0.028], '#ffffff', 16, 'matte', 1, [Math.PI / 2, 0, 0]);
  });
}

// ——— Café ———
export function buildCafe(b: Batch) {
  const bar = CAFE_BAR;
  b.box([bar.halfDepth * 2, 0.9, bar.halfLength * 2], [bar.x, 0.45, bar.z], '#2f5d57');
  b.box([bar.halfDepth * 2 + 0.02, 0.1, bar.halfLength * 2 + 0.02], [bar.x, 0.05, bar.z], '#1f3d39');
  b.box([bar.halfDepth * 2 + 0.12, 0.05, bar.halfLength * 2 + 0.1], [bar.x + 0.03, bar.height - 0.025, bar.z], OAK);
  // On the bar: cups, a cake under a dome, a jar and a small plant pot.
  [0, 0.09, 0.18].forEach((d) => b.cyl(0.035, 0.028, 0.075, [bar.x + 0.12, bar.height + 0.038, bar.z - 0.85 + d], '#f7f4ee', 10));
  b.cyl(0.17, 0.17, 0.015, [bar.x, bar.height + 0.008, bar.z + 0.1], '#f7f4ee', 18).cyl(0.11, 0.11, 0.07, [bar.x, bar.height + 0.05, bar.z + 0.1], '#c98a5a', 14).cyl(0.112, 0.112, 0.02, [bar.x, bar.height + 0.09, bar.z + 0.1], '#f4d7dc', 14);
  b.cyl(0.07, 0.07, 0.16, [bar.x - 0.05, bar.height + 0.08, bar.z + 0.9], '#e9b96e', 12).cyl(0.072, 0.072, 0.02, [bar.x - 0.05, bar.height + 0.17, bar.z + 0.9], TRIM, 12);
  b.slab([0.02, 0.26, 0.2], [bar.x + 0.14, bar.height + 0.13, bar.z + 1.6], [0, 0, -0.25], '#26332f');
  for (const p of CAFE_STOOLS) {
    b.cyl(0.2, 0.2, 0.03, [p[0], 0.015, p[1]], TRIM, 14).cyl(0.025, 0.025, 0.62, [p[0], 0.33, p[1]], '#8a8f98', 8).cyl(0.19, 0.17, 0.07, [p[0], 0.675, p[1]], ORANGE, 16);
  }
  for (const t of CAFE_TABLES) {
    b.cyl(0.28, 0.3, 0.03, [t[0], 0.015, t[1]], TRIM, 18).cyl(0.045, 0.045, CAFE_TABLE_HEIGHT - 0.05, [t[0], CAFE_TABLE_HEIGHT / 2, t[1]], TRIM, 10);
    b.cyl(CAFE_TABLE_RADIUS, CAFE_TABLE_RADIUS, 0.04, [t[0], CAFE_TABLE_HEIGHT - 0.02, t[1]], '#f3ead9', 28);
    b.cyl(0.04, 0.03, 0.07, [t[0] + 0.22, CAFE_TABLE_HEIGHT + 0.035, t[1] + 0.12], '#f7f4ee', 10).cyl(0.04, 0.03, 0.07, [t[0] - 0.2, CAFE_TABLE_HEIGHT + 0.035, t[1] - 0.18], TEAL, 10);
  }
  // Pendant lamps over the tables and the bar.
  const pendant = (x: number, z: number, y: number, color: string) => {
    b.cyl(0.006, 0.006, WALL_HEIGHT - y, [x, (WALL_HEIGHT + y) / 2, z], TRIM, 5);
    b.cyl(0.06, 0.2, 0.2, [x, y - 0.08, z], color, 16);
    b.sphere(0.065, [x, y - 0.17, z], rgb(WARM), 10, 'glow', 1.7);
  };
  CAFE_TABLES.forEach((t, i) => pendant(t[0], t[1], 2.05, i ? TEAL : ORANGE));
  [-1.4, 0, 1.4].forEach((d, i) => pendant(bar.x + 0.1, bar.z + d, 2.15, i === 1 ? ORANGE : TEAL));
  // Water cooler.
  b.box([0.34, 1.0, 0.34], [WATER_COOLER[0], 0.5, WATER_COOLER[1]], '#eef0f2').cyl(0.13, 0.13, 0.36, [WATER_COOLER[0], 1.2, WATER_COOLER[1]], '#9fd4ec', 14).cyl(0.05, 0.13, 0.06, [WATER_COOLER[0], 1.03, WATER_COOLER[1]], '#9fd4ec', 14);
  b.box([0.02, 0.05, 0.05], [WATER_COOLER[0] + 0.18, 0.78, WATER_COOLER[1] - 0.07], '#3f7fd6').box([0.02, 0.05, 0.05], [WATER_COOLER[0] + 0.18, 0.78, WATER_COOLER[1] + 0.07], '#d6453f');
}

// ——— Library ———
const BOOKS = ['#c0563f', '#3f7f7a', '#e0a63a', '#5a6ea8', '#8a5a9c', '#d9d2c6', '#4f8a5b', '#b9433f', '#2f5d57', '#e8743b'];
export function buildLibrary(b: Batch) {
  const r = rng(21), sh = LIB_SHELF, rows = 5, rowH = (sh.height - 0.16) / rows;
  for (const s of LIB_SHELVES) {
    const len = s.half * 2;
    b.box([0.03, sh.height, len], [OUT - 0.1, sh.height / 2, s.z], '#5c3f2b'); // back
    for (const e of [-1, 1]) b.box([sh.depth, sh.height, 0.05], [sh.x, sh.height / 2, s.z + e * (s.half - 0.025)], '#6b4a33');
    b.box([sh.depth, 0.05, len], [sh.x, sh.height - 0.025, s.z], '#6b4a33');
    for (let row = 0; row < rows; row++) {
      const y = 0.08 + row * rowH;
      b.box([sh.depth, 0.04, len], [sh.x, y, s.z], '#6b4a33');
      // A row of books of different widths, heights and colours, with a gap here and there.
      let z = s.z - s.half + 0.08;
      while (z < s.z + s.half - 0.14) {
        const w = 0.035 + r() * 0.05, h = rowH * (0.55 + r() * 0.32), d = sh.depth * (0.6 + r() * 0.25);
        if (r() < 0.06) { z += 0.12 + r() * 0.15; continue; }
        b.box([d, h, w], [sh.x - (sh.depth - d) / 2 + 0.03, y + 0.02 + h / 2, z + w / 2], BOOKS[Math.floor(r() * BOOKS.length)]);
        z += w + 0.004;
      }
    }
  }
  // Reading table.
  const [tx, tz] = LIB_TABLE.pos, [hx, hz] = LIB_TABLE.half;
  b.box([hx * 2, 0.05, hz * 2], [tx, LIB_TABLE.height - 0.025, tz], '#d9b98c');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.07, LIB_TABLE.height - 0.05, 0.07], [tx + sx * (hx - 0.1), (LIB_TABLE.height - 0.05) / 2, tz + sz * (hz - 0.12)], '#b99668');
  // Focus pod: a felt booth with a bench and a soft light.
  for (const p of LIB_PODS) {
    const x = p[0] + 0.05;
    for (const s of [-1, 1]) b.box([1.25, 2.05, 0.07], [x, 1.025, p[1] + s * 0.72], '#2f5d57');
    b.box([0.06, 2.05, 1.5], [OUT - 0.12, 1.025, p[1]], '#3b7069');
    b.box([1.3, 0.07, 1.51], [x, 2.085, p[1]], '#2f5d57');
    b.box([0.6, 0.4, 1.36], [p[0] + 0.3, 0.2, p[1]], '#e9e2d3').box([0.62, 0.1, 1.36], [p[0] + 0.3, 0.45, p[1]], ORANGE).box([0.1, 0.62, 1.36], [OUT - 0.2, 0.85, p[1]], ORANGE);
    b.box([0.9, 0.025, 0.06], [x, 2.03, p[1]], rgb(WARM), 0, 'glow', 1.6);
    b.box([0.34, 0.03, 0.3], [p[0] + 0.25, 0.72, p[1] - 0.5], '#d9b98c');
  }
  // A wall clock above the pod.
  b.cyl(0.26, 0.26, 0.03, [OUT - 0.1, 2.55, 0], '#3a3330', 24, 'matte', 1, [0, 0, Math.PI / 2]).cyl(0.23, 0.23, 0.035, [OUT - 0.1, 2.55, 0], '#f7f4ee', 24, 'matte', 1, [0, 0, Math.PI / 2]);
  b.box([0.04, 0.14, 0.014], [OUT - 0.12, 2.6, 0], TRIM).box([0.04, 0.014, 0.11], [OUT - 0.12, 2.55, 0.05], TRIM);
}

// ——— Garden ———
export const STRING_POLES: [number, number][] = [[GARDEN.max[0] - 0.6, GARDEN.min[1] + 0.6], [GARDEN.min[0] + 0.6, GARDEN.min[1] + 0.6], [GARDEN.min[0] + 0.6, GARDEN.max[1] - 0.6], [GARDEN.max[0] - 0.6, GARDEN.max[1] - 0.6]];
export function buildGarden(b: Batch) {
  const [x0, z0] = GARDEN.min, [x1, z1] = GARDEN.max, cx = (x0 + x1) / 2, w = x1 - x0, d = z1 - z0;
  const r = rng(5);
  // The land around the building, the lawn and its hedge.
  b.cyl(70, 70, 0.02, [0, -0.07, 0], '#b9d3a2', 40);
  b.box([w, 0.05, d], [cx, -0.025, 0], '#86bd6f');
  b.box([0.5, 1.1, d + 1], [x0 - 0.25, 0.55, 0], '#4a8a4d');
  for (const z of [z0 - 0.25, z1 + 0.25]) b.box([w + 0.5, 1.1, 0.5], [cx - 0.25, 0.55, z], '#4a8a4d');
  // Stone paths: from the door to the fountain, around it, and out to the benches.
  const fx = FOUNTAIN.pos[0];
  b.box([x1 - fx - 1.6, 0.014, 1.3], [(x1 + fx + 1.6) / 2, 0.007, 0], '#dcd2bf');
  b.cyl(2.0, 2.0, 0.014, [fx, 0.006, 0], '#dcd2bf', 32);
  for (const s of [-1, 1]) b.box([1.2, 0.014, d / 2 - 2.6], [fx, 0.007, s * (d / 4 + 0.75)], '#dcd2bf');
  // Fountain: a stone basin, a column and a bowl (the water moves live).
  b.cyl(FOUNTAIN.r, FOUNTAIN.r + 0.06, 0.42, [fx, 0.21, 0], '#cfc6b6', 28);
  b.cyl(FOUNTAIN.r - 0.12, FOUNTAIN.r - 0.12, 0.02, [fx, 0.425, 0], '#79c6de', 28);
  b.cyl(0.13, 0.17, 0.95, [fx, 0.475, 0], '#cfc6b6', 12).cyl(0.46, 0.14, 0.14, [fx, 1.0, 0], '#cfc6b6', 20).cyl(0.4, 0.4, 0.02, [fx, 1.075, 0], '#8fd6ea', 20);
  // Trees.
  GARDEN_TREES.forEach((t, i) => {
    const k = 0.85 + ((i * 37) % 10) / 30;
    b.cyl(0.11, 0.16, 1.5 * k, [t[0], 0.75 * k, t[1]], '#7a5a3c', 8);
    b.sphere(0.95 * k, [t[0], 2.15 * k, t[1]], '#5fa35c', 10).sphere(0.68 * k, [t[0] + 0.4, 2.8 * k, t[1] + 0.2], '#6fb36a', 9).sphere(0.6 * k, [t[0] - 0.42, 2.65 * k, t[1] - 0.25], '#539652', 9);
  });
  // Benches (front towards −Z, turned to their seats' facing).
  for (const bench of GARDEN_BENCHES) {
    b.push([bench.pos[0], 0, bench.pos[1]], bench.facing);
    b.box([1.7, 0.06, 0.46], [0, 0.45, 0], '#b58355').slab([1.7, 0.42, 0.05], [0, 0.82, 0.26], [0.12, 0, 0], '#b58355');
    for (const s of [-1, 1]) b.box([0.07, 0.45, 0.44], [s * 0.75, 0.225, 0], TRIM).box([0.07, 0.5, 0.06], [s * 0.75, 0.7, 0.25], TRIM);
    b.pop();
  }
  // Flowers along the hedge and bushes in the corners.
  const petals = ['#ff7aa2', '#ffd23f', '#ffffff', '#ff9a4d', '#c89bff'];
  for (let i = 0; i < 46; i++) {
    const side = i % 3;
    const fxp = side === 0 ? x0 + 0.35 + r() * 0.5 : x0 + 0.5 + r() * (w - 1.6);
    const fzp = side === 0 ? z0 + 0.6 + r() * (d - 1.2) : side === 1 ? z0 + 0.3 + r() * 0.45 : z1 - 0.3 - r() * 0.45;
    b.sphere(0.13, [fxp, 0.06, fzp], '#5c9a55', 6, 'matte', 1, [1, 0.6, 1]);
    b.sphere(0.055 + r() * 0.03, [fxp + (r() - 0.5) * 0.1, 0.17 + r() * 0.08, fzp + (r() - 0.5) * 0.1], petals[Math.floor(r() * petals.length)], 6);
  }
  // Festoon lights between four posts, sagging a little.
  STRING_POLES.forEach((p) => b.cyl(0.035, 0.045, 2.5, [p[0], 1.25, p[1]], TRIM, 8));
  for (let s = 0; s < 3; s++) {
    const a = STRING_POLES[s], c = STRING_POLES[s + 1];
    const n = Math.round(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.62);
    for (let i = 1; i < n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * 0.32;
      b.sphere(0.05, [a[0] + (c[0] - a[0]) * t, 2.46 - sag, a[1] + (c[1] - a[1]) * t], i % 2 ? '#ffd9a0' : '#ffb3c7', 6, 'glow', 1.5);
    }
  }
  // Two lanterns by the path.
  for (const s of [-1, 1]) { b.cyl(0.03, 0.04, 1.1, [x1 - 1.4, 0.55, s * 1.05], TRIM, 8); b.sphere(0.12, [x1 - 1.4, 1.18, s * 1.05], rgb(WARM), 10, 'glow', 1.6); }
}

/** A dome of sky: pale at the horizon, bluer above. */
export function skyColors(y: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, y));
  return [0.86 - 0.42 * t, 0.91 - 0.26 * t, 0.96 - 0.05 * t];
}
