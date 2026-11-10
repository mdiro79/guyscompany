// Floor plan of the office in metres (top view). +Z points to the entrance (south), +X to the east.
// Corridors form a "+" around the round glass conference room; the four offices sit in the corners;
// reception faces the entrance door. Decorative parts without a function were dropped (owner decision).

export type Vec2 = [number, number];
export interface Segment { a: Vec2; b: Vec2; kind: 'solid' | 'glass' | 'door' | 'obstacle'; slot?: number; color?: string }
export type SeatArea = 'office' | 'conference' | 'cafe' | 'library' | 'game' | 'garden';
export interface Seat { id: string; pos: Vec2; facing: number; slot?: number; monitor?: { pos: [number, number, number]; facing: number }; area: SeatArea; exit?: Vec2 } // exit: where you stand up (default: a step behind the chair)
// Something to use with E (or the phone's action button) that is not a seat or a door.
export interface Station { id: string; kind: 'arcade' | 'jukebox' | 'coffee'; pos: Vec2; facing: number } // facing: the way its front points (rotation about Y, front = +Z)
export interface Prop { model: string; pos: Vec2; rot: number; size: number; y?: number; h?: number } // h = target height (else uniform scale)
export interface OfficeRoom { slot: number; min: Vec2; max: Vec2; door: { a: Vec2; b: Vec2 }; wallColor: 'orange' | 'teal' }
export type Circle = { pos: Vec2; r: number };
// A hinged door leaf. Angles are directions in the floor plane (atan2 of z, x) from the hinge to the free end.
export interface DoorDef { id: string; kind: 'office' | 'conference' | 'entrance' | 'room'; slot?: number; hinge: Vec2; width: number; closed: number; open: number; defaultOpen: boolean }

export const WALL_HEIGHT = 3;
export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;
export const AVATAR_RADIUS = 0.3;
export const H = 7; // corridor half width around the centre
export const OUT = 15; // outer extent of offices
export const SOUTH = 16; // entrance wall (vestibule protrudes 1 m)
export const PORCH = 2.2; // glass porch outside the entrance door
export const CONF_RADIUS = 4.5;
export const DOOR_WIDTH = 1.4;
const ENTRANCE_HALF = 0.9;
const CONF_DOOR_HALF_ANGLE = Math.asin(DOOR_WIDTH / 2 / CONF_RADIUS);
// Half the arc (around north) where the conference ring is solid panelling behind the screen.
export const CONF_PANEL_HALF_ANGLE = 1.05;
export const RECEPTION_Z = SOUTH - 4.5; // reception desk centre
// Rooms added around the "+" (owner request): the game room fills the north notch between the two north
// offices, the west arm is the café, the east arm the library, and a garden lies outside the café's glass wall.
export const GARDEN_DEPTH = 9;
export const GARDEN = { min: [-OUT - GARDEN_DEPTH, -H] as Vec2, max: [-OUT, H] as Vec2 };
export const GAME = { min: [-H, -OUT] as Vec2, max: [H, -H] as Vec2 };
export const CAFE = { min: [-OUT, -H] as Vec2, max: [-H, H] as Vec2 };
export const LIBRARY = { min: [H, -H] as Vec2, max: [OUT, H] as Vec2 };
export const GAME_WALL = '#34365f'; // deep indigo, so the neon and the screens stand out

const officeCx = (slot: number) => (slot % 2 === 1 ? -1 : 1) * (H + OUT) / 2;

// Each office: slot, bounds, door in the wall facing the east/west corridor arm.
export const OFFICES: OfficeRoom[] = [1, 2, 3, 4].map((slot) => {
  const west = slot % 2 === 1, north = slot <= 2;
  const cx = officeCx(slot), dz = north ? -H : H;
  return {
    slot,
    min: [west ? -OUT : H, north ? -OUT : H] as Vec2,
    max: [west ? -H : OUT, north ? -H : OUT] as Vec2,
    door: { a: [cx - DOOR_WIDTH / 2, dz] as Vec2, b: [cx + DOOR_WIDTH / 2, dz] as Vec2 },
    wallColor: slot === 1 || slot === 4 ? 'orange' as const : 'teal' as const,
  };
});

export const SPAWN: { pos: Vec2; yaw: number } = { pos: [0, SOUTH - 1.1], yaw: 0 }; // by the entrance, facing reception (north)
export const RECEPTION: { pos: Vec2; facing: number } = { pos: [0, RECEPTION_Z], facing: 0 };
// The receptionist sits behind the desk facing the entrance (yaw π looks to +Z).
export const RECEPTIONIST_SEAT: { pos: Vec2; facing: number } = { pos: [0, RECEPTION_Z - 0.68], facing: Math.PI };
export const RECEPTIONIST_POS: Vec2 = RECEPTIONIST_SEAT.pos;
const DESK_HALF: Vec2 = [0.82, 0.42]; // reception desk footprint (half sizes)

const seg = (a: Vec2, b: Vec2, kind: Segment['kind'] = 'solid', slot?: number): Segment => ({ a, b, kind, slot });

// Splits a wall from a to b around a door gap [d0, d1] (points on the wall).
function wallWithDoor(a: Vec2, b: Vec2, d0: Vec2, d1: Vec2, kind: Segment['kind'], slot: number): Segment[] {
  return [seg(a, d0, kind, slot), seg(d0, d1, 'door', slot), seg(d1, b, kind, slot)];
}

const box = (cx: number, cz: number, hx: number, hz: number): Segment[] => {
  const p: Vec2[] = [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
  return p.map((a, i) => seg(a, p[(i + 1) % 4], 'obstacle'));
};

export function buildWalls(): Segment[] {
  const w: Segment[] = [];
  // Outer shell (clockwise from north-west office). The north wall runs straight across: the notch between
  // the two north offices is the game room, behind a glass front with a door on the north corridor.
  w.push(seg([-OUT, -OUT], [-H, -OUT]), { ...seg([-H, -OUT], [H, -OUT]), color: GAME_WALL }, seg([H, -OUT], [OUT, -OUT]));
  w.push(seg([-H, -OUT], [-H, -H]), seg([H, -H], [H, -OUT]));
  w.push(seg([-H, -H], [-DOOR_WIDTH / 2, -H], 'glass'), seg([DOOR_WIDTH / 2, -H], [H, -H], 'glass'));
  w.push(seg([OUT, -OUT], [OUT, -H]), seg([OUT, -H], [OUT, H]), seg([OUT, H], [OUT, OUT]), seg([OUT, OUT], [H, OUT]), seg([H, OUT], [H, SOUTH]));
  w.push(seg([H, SOUTH], [ENTRANCE_HALF, SOUTH]), seg([-ENTRANCE_HALF, SOUTH], [-H, SOUTH])); // entrance gap (door leaf in doors())
  w.push(seg([-H, SOUTH], [-H, OUT]), seg([-H, OUT], [-OUT, OUT]), seg([-OUT, OUT], [-OUT, H]), seg([-OUT, -H], [-OUT, -OUT]));
  // The café looks onto the garden through glass, with a door in the middle.
  w.push(seg([-OUT, H], [-OUT, DOOR_WIDTH / 2], 'glass'), seg([-OUT, -DOOR_WIDTH / 2], [-OUT, -H], 'glass'));
  // Garden hedge (drawn by the garden itself).
  const [gx0, gz0] = GARDEN.min, [gx1, gz1] = GARDEN.max;
  w.push(seg([gx1, gz0], [gx0, gz0], 'obstacle'), seg([gx0, gz0], [gx0, gz1], 'obstacle'), seg([gx0, gz1], [gx1, gz1], 'obstacle'));
  // Glass porch outside the entrance (keeps people from walking off into the void).
  w.push(seg([-ENTRANCE_HALF, SOUTH], [-ENTRANCE_HALF, SOUTH + PORCH], 'glass'), seg([-ENTRANCE_HALF, SOUTH + PORCH], [ENTRANCE_HALF, SOUTH + PORCH], 'glass'), seg([ENTRANCE_HALF, SOUTH + PORCH], [ENTRANCE_HALF, SOUTH], 'glass'));
  // Office walls towards corridors are glass with a door; north offices' inner walls are exterior (solid shell).
  for (const o of OFFICES) {
    const [x0, z0] = o.min, [x1, z1] = o.max;
    const north = o.slot <= 2;
    if (!north) {
      const innerX = o.slot % 2 === 1 ? x1 : x0;
      w.push(seg([innerX, z0], [innerX, z1], 'glass', o.slot));
    }
    const doorZ = north ? z1 : z0;
    w.push(...wallWithDoor([x0, doorZ], [x1, doorZ], o.door.a, o.door.b, 'glass', o.slot));
  }
  // Conference room: glass ring with a door gap facing south (angle 0 = south, +Z). Behind the screen
  // (north) the ring is solid panelling instead of glass.
  const n = 40, g = CONF_DOOR_HALF_ANGLE;
  for (let i = 0; i < n; i++) {
    const t0 = g + (i / n) * (Math.PI * 2 - 2 * g), t1 = g + ((i + 1) / n) * (Math.PI * 2 - 2 * g);
    const panel = Math.abs((t0 + t1) / 2 - Math.PI) < CONF_PANEL_HALF_ANGLE;
    w.push(seg([Math.sin(t0) * CONF_RADIUS, Math.cos(t0) * CONF_RADIUS], [Math.sin(t1) * CONF_RADIUS, Math.cos(t1) * CONF_RADIUS], panel ? 'solid' : 'glass'));
  }
  // Media cabinet under the conference screen.
  w.push(...box(0, CONF_CREDENZA.z, CONF_CREDENZA.halfWidth, CONF_CREDENZA.halfDepth));
  // Reception desk as a solid obstacle.
  w.push(...box(RECEPTION.pos[0], RECEPTION.pos[1], DESK_HALF[0], DESK_HALF[1]));
  // Box-shaped furniture of the new rooms.
  for (const b of SOLID_BOXES) w.push(...box(b[0], b[1], b[2], b[3]));
  return w.filter((s) => s.kind !== 'door');
}

// All hinged doors: one per office, the conference room and the entrance.
export function doors(): DoorDef[] {
  const confZ = Math.cos(CONF_DOOR_HALF_ANGLE) * CONF_RADIUS;
  return [
    ...OFFICES.map((o) => ({
      id: `o${o.slot}`, kind: 'office' as const, slot: o.slot, hinge: o.door.a, width: DOOR_WIDTH,
      closed: 0, open: (o.slot <= 2 ? -1 : 1) * 1.35, defaultOpen: false, // swings into the office
    })),
    { id: 'conf', kind: 'conference', hinge: [-DOOR_WIDTH / 2, confZ], width: DOOR_WIDTH, closed: 0, open: -1.35, defaultOpen: true },
    { id: 'entrance', kind: 'entrance', hinge: [-ENTRANCE_HALF, SOUTH], width: ENTRANCE_HALF * 2, closed: 0, open: 1.2, defaultOpen: false },
    { id: 'game', kind: 'room', hinge: [-DOOR_WIDTH / 2, -H], width: DOOR_WIDTH, closed: 0, open: -1.35, defaultOpen: true }, // swings into the game room
    { id: 'garden', kind: 'room', hinge: [-OUT, -DOOR_WIDTH / 2], width: DOOR_WIDTH, closed: Math.PI / 2, open: Math.PI / 2 + 1.35, defaultOpen: false }, // swings out to the garden
  ];
}

export const doorLeaf = (d: DoorDef, angle: number): Segment => ({
  a: d.hinge, b: [d.hinge[0] + Math.cos(angle) * d.width, d.hinge[1] + Math.sin(angle) * d.width], kind: 'door', slot: d.slot,
});
export const doorCenter = (d: DoorDef): Vec2 => [d.hinge[0] + Math.cos(d.closed) * d.width / 2, d.hinge[1] + Math.sin(d.closed) * d.width / 2];

// Closed office door gaps (kept for the access rules: a door the viewer may not open always blocks).
export function doorSegments(): Segment[] {
  return OFFICES.map((o) => ({ a: o.door.a, b: o.door.b, kind: 'door' as const, slot: o.slot }));
}

// Desk + chair per office, against the outer wall, facing outward (monitor on the desk).
export function officeSeats(): Seat[] {
  return OFFICES.map((o) => {
    const cx = (o.min[0] + o.max[0]) / 2;
    const north = o.slot <= 2;
    const deskZ = north ? o.min[1] + 1.5 : o.max[1] - 1.5;
    const chairZ = north ? deskZ + 0.85 : deskZ - 0.85;
    const facing = north ? Math.PI : 0; // yaw: 0 looks to -Z (north)
    const lookYaw = north ? 0 : Math.PI;
    return {
      id: `office-${o.slot}`, pos: [cx, chairZ] as Vec2, facing: lookYaw, slot: o.slot, area: 'office' as const,
      monitor: { pos: [cx, 1.13, deskZ + (north ? -0.18 : 0.18)] as [number, number, number], facing },
    };
  });
}

// Round table with a planter in the middle, 8 chairs (none in front of the screen or the door),
// a screen on the solid north panelling with a media cabinet below it and a tall plant on each side.
export const CONF_TABLE_RADIUS = 1.75;
export const CONF_TABLE_HOLE = 0.42;
export const CONF_TABLE_HEIGHT = 0.76;
export const CONF_CHAIR_RING = 2.5;
export const CONF_SEATS = 8;
export const CONF_SCREEN = { z: -CONF_RADIUS + 0.56, width: 3.0, height: 1.69, bottom: 0.98 };
export const CONF_CREDENZA = { z: -CONF_RADIUS + 0.68, halfWidth: 1.45, halfDepth: 0.2, height: 0.58 };
export const CONF_PLANTS: Vec2[] = [[-2.25, -3.2], [2.25, -3.2]];
// Smart wall panel for the room's light and glass: inside, on the glass right of the door as you come in.
export const CONF_WALL_PANEL = (() => {
  const a = 0.36, r = CONF_RADIUS - 0.05;
  return { pos: [Math.sin(a) * r, Math.cos(a) * r] as Vec2, y: 1.3, facing: a + Math.PI };
})();

export function conferenceSeats(): Seat[] {
  return Array.from({ length: CONF_SEATS }, (_, i) => {
    const t = (i / CONF_SEATS) * Math.PI * 2 + Math.PI / CONF_SEATS;
    const pos: Vec2 = [Math.sin(t) * CONF_CHAIR_RING, Math.cos(t) * CONF_CHAIR_RING];
    return { id: `conf-${i}`, pos, facing: Math.atan2(pos[0], pos[1]), area: 'conference' as const };
  });
}

// Yaw of someone at `pos` looking at `target` (yaw 0 looks to -Z).
const facingTo = (pos: Vec2, target: Vec2) => Math.atan2(pos[0] - target[0], pos[1] - target[1]);
// Sofas and benches stand against a wall: you get up in front of them.
const inFront = (pos: Vec2, facing: number, d = 0.95): Vec2 => [pos[0] - Math.sin(facing) * d, pos[1] - Math.cos(facing) * d];
const around = (c: Vec2, r: number, angles: number[]): Vec2[] => angles.map((a) => [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r]);

// ——— Café (west arm) ———
export const CAFE_TABLES: Vec2[] = [[-12.2, -2.6], [-12.2, 2.6]];
export const CAFE_TABLE_RADIUS = 0.55;
export const CAFE_TABLE_HEIGHT = 0.76;
export const CAFE_BAR = { x: -OUT + 0.45, z: -3.9, halfDepth: 0.33, halfLength: 2.1, height: 0.95 }; // along the glass wall, north of the garden door
export const CAFE_SOFA: { pos: Vec2; facing: number } = { pos: [-OUT + 0.75, 4.2], facing: -Math.PI / 2 }; // looks east into the room
export const COFFEE_MACHINE: Vec2 = [CAFE_BAR.x, CAFE_BAR.z - 1.3];
export const CAFE_STOOLS: Vec2[] = [-0.35, 0.55, 1.45].map((d) => [CAFE_BAR.x + 0.82, CAFE_BAR.z + d]);
export const WATER_COOLER: Vec2 = [-OUT + 0.4, 1.35];
export function cafeSeats(): Seat[] {
  const s: Seat[] = [];
  // Chair angles of the south table; the north one mirrors them, so both leave the middle walkway free.
  const angles = [1.2, 3.3, 5.4];
  CAFE_TABLES.forEach((t, i) => around(t, 1.02, t[1] > 0 ? angles : angles.map((a) => Math.PI - a)).forEach((pos, j) => s.push({ id: `cafe-${i}-${j}`, pos, facing: facingTo(pos, t), area: 'cafe' })));
  CAFE_STOOLS.forEach((pos, i) => s.push({ id: `cafe-stool-${i}`, pos, facing: Math.PI / 2, area: 'cafe' })); // facing the bar
  s.push({ id: 'cafe-sofa', pos: CAFE_SOFA.pos, facing: CAFE_SOFA.facing, area: 'cafe', exit: inFront(CAFE_SOFA.pos, CAFE_SOFA.facing, 2.1) });
  return s;
}

// ——— Library (east arm) ———
export const LIB_TABLE = { pos: [10.6, 0] as Vec2, half: [0.55, 1.15] as Vec2, height: 0.75 }; // long reading table, north–south
export const LIB_SHELVES: { z: number; half: number }[] = [{ z: -3.3, half: 2.3 }, { z: 3.3, half: 2.3 }]; // against the east wall
export const LIB_SHELF = { x: OUT - 0.25, depth: 0.42, height: 2.25 };
export const LIB_PODS: Vec2[] = [[OUT - 1.0, 0]]; // focus pod between the shelves
export const LIB_ARMCHAIRS: { pos: Vec2; facing: number }[] = [-1, 1].map((s) => ({ pos: [OUT - 1.35, s * 6.1] as Vec2, facing: facingTo([OUT - 1.35, s * 6.1], [OUT - 3.2, s * 4.4]) })); // in the corners beside the shelves
export function librarySeats(): Seat[] {
  const [tx, tz] = LIB_TABLE.pos;
  const s: Seat[] = [];
  for (const side of [-1, 1]) for (const dz of [-0.6, 0.6]) {
    const pos: Vec2 = [tx + side * (LIB_TABLE.half[0] + 0.42), tz + dz];
    s.push({ id: `lib-${side < 0 ? 'w' : 'e'}${dz < 0 ? 'n' : 's'}`, pos, facing: facingTo(pos, [tx, pos[1]]), area: 'library' });
  }
  LIB_PODS.forEach((p, i) => s.push({ id: `pod-${i}`, pos: p, facing: Math.PI / 2, area: 'library', exit: inFront(p, Math.PI / 2, 1.3) })); // looks west, out of the pod
  LIB_ARMCHAIRS.forEach((a, i) => s.push({ id: `lib-chair-${i}`, pos: a.pos, facing: a.facing, area: 'library', exit: inFront(a.pos, a.facing) }));
  return s;
}

// ——— Game room (north wing) ———
export const GAME_TV = { x: -3.9, z: -OUT + 0.12, width: 2.2, height: 1.24, bottom: 0.95 };
export const GAME_SOFA: Vec2 = [GAME_TV.x, -11.4];
export const XO_TABLE: Vec2 = [4.4, -9.6];
export const DANCE_FLOOR = { pos: [0.4, -12.2] as Vec2, half: 1.6, tiles: 4 };
export const ARCADES: Vec2[] = [[-H + 0.5, -8.7], [-H + 0.5, -10.0]];
export const JUKEBOX: Vec2 = [H - 0.5, -12.7];
export const BEAN_BAGS: Vec2[] = [[5.7, -14.1], [4.5, -14.25]];
export function gameSeats(): Seat[] {
  const s: Seat[] = [];
  for (const dx of [-0.5, 0.5]) s.push({ id: `game-sofa-${dx < 0 ? 'a' : 'b'}`, pos: [GAME_SOFA[0] + dx, GAME_SOFA[1]], facing: 0, area: 'game', exit: inFront([GAME_SOFA[0] + dx, GAME_SOFA[1]], 0) });
  for (const side of [-1, 1]) {
    const pos: Vec2 = [XO_TABLE[0] + side * 0.95, XO_TABLE[1]];
    s.push({ id: `xo-${side < 0 ? 'a' : 'b'}`, pos, facing: facingTo(pos, XO_TABLE), area: 'game' });
  }
  return s;
}

// ——— Garden (outside the café) ———
export const FOUNTAIN = { pos: [-OUT - GARDEN_DEPTH / 2, 0] as Vec2, r: 1.15 };
export const GARDEN_TREES: Vec2[] = [[-OUT - 1.5, -5.6], [-OUT - 1.5, 5.6], [-OUT - GARDEN_DEPTH + 1.3, -5.4], [-OUT - GARDEN_DEPTH + 1.3, 5.4], [-OUT - GARDEN_DEPTH + 1.1, 0]];
export const GARDEN_BENCHES: { pos: Vec2; facing: number }[] = [
  { pos: [FOUNTAIN.pos[0], -H + 1.0], facing: Math.PI }, // looks south to the fountain
  { pos: [FOUNTAIN.pos[0], H - 1.0], facing: 0 },
];
export function gardenSeats(): Seat[] {
  const s: Seat[] = [];
  GARDEN_BENCHES.forEach((b, i) => { for (const d of [-0.42, 0.42]) s.push({ id: `garden-${i}${d < 0 ? 'a' : 'b'}`, pos: [b.pos[0] + d, b.pos[1]], facing: b.facing, area: 'garden', exit: inFront([b.pos[0] + d, b.pos[1]], b.facing) }); });
  return s;
}

export const allSeats = () => [...officeSeats(), ...conferenceSeats(), ...cafeSeats(), ...librarySeats(), ...gameSeats(), ...gardenSeats()];

// Things used with E: arcade cabinets, the jukebox and the coffee machine.
export function stations(): Station[] {
  return [
    ...ARCADES.map((pos, i) => ({ id: `arcade-${i}`, kind: 'arcade' as const, pos, facing: Math.PI / 2 })),
    { id: 'jukebox', kind: 'jukebox', pos: JUKEBOX, facing: -Math.PI / 2 },
    { id: 'coffee', kind: 'coffee', pos: COFFEE_MACHINE, facing: Math.PI / 2 },
  ];
}

// Box-shaped furniture that blocks walking: [centre x, centre z, half x, half z].
const SOLID_BOXES: [number, number, number, number][] = [
  [CAFE_BAR.x, CAFE_BAR.z, CAFE_BAR.halfDepth, CAFE_BAR.halfLength],
  [CAFE_SOFA.pos[0] - 0.1, CAFE_SOFA.pos[1], 0.5, 1.05],
  ...LIB_SHELVES.map((b): [number, number, number, number] => [LIB_SHELF.x, b.z, LIB_SHELF.depth / 2, b.half]),
  [LIB_TABLE.pos[0], LIB_TABLE.pos[1], LIB_TABLE.half[0] - 0.1, LIB_TABLE.half[1] - 0.05],
  ...LIB_PODS.flatMap((p): [number, number, number, number][] => [[p[0] + 0.05, p[1] - 0.72, 0.6, 0.05], [p[0] + 0.05, p[1] + 0.72, 0.6, 0.05]]), // the pod's side walls
  ...ARCADES.map((p): [number, number, number, number] => [p[0] - 0.1, p[1], 0.38, 0.36]),
  [JUKEBOX[0] + 0.1, JUKEBOX[1], 0.36, 0.42],
  [GAME_SOFA[0], GAME_SOFA[1] + 0.12, 1.0, 0.36],
  [GAME_TV.x, -OUT + 0.3, 1.0, 0.22], // the TV cabinet
  ...GARDEN_BENCHES.map((b): [number, number, number, number] => [b.pos[0], b.pos[1] + (b.facing ? -0.12 : 0.12), 0.85, 0.2]),
];

// Floor guide lines (orange and teal) from the entrance to the conference door and each office door.
export function guideLines(): { color: 'orange' | 'teal'; points: Vec2[] }[] {
  const z = RECEPTION_Z;
  const lines: { color: 'orange' | 'teal'; points: Vec2[] }[] = [
    { color: 'orange', points: [[0.25, SOUTH - 0.5], [0.25, z + 1.2], [1.5, z + 0.7], [1.5, z - 1.5], [0.25, H - 0.2], [0.25, CONF_RADIUS + 0.4]] },
  ];
  for (const o of OFFICES) {
    const dx = (o.door.a[0] + o.door.b[0]) / 2;
    const north = o.slot <= 2;
    const side = Math.sign(dx);
    const zDoor = north ? -H + 0.4 : H - 0.4;
    const pts: Vec2[] = [[side * 0.6, z + 1.25], [side * 2.4, z + 0.9], [side * 2.4, z - 1.6], [side * (H - 1.2), H - 0.9]];
    if (north) pts.push([side * (H - 1.2), 0], [side * (H + 1.2), -H + 2.2], [dx, -H + 2.2]);
    else pts.push([side * (H + 1.2), H - 1.6], [dx, H - 1.6]);
    pts.push([dx, zDoor]);
    lines.push({ color: o.wallColor, points: pts });
  }
  return lines;
}

export function officeAt(x: number, z: number): OfficeRoom | null {
  return OFFICES.find((o) => x > o.min[0] && x < o.max[0] && z > o.min[1] && z < o.max[1]) ?? null;
}

export const inConference = (x: number, z: number) => Math.hypot(x, z) < CONF_RADIUS;

const within = (r: { min: Vec2; max: Vec2 }, x: number, z: number) => x > r.min[0] && x < r.max[0] && z > r.min[1] && z < r.max[1];
export type Area = 'office' | 'conference' | 'reception' | 'cafe' | 'library' | 'game' | 'garden' | 'corridor';
export function areaAt(x: number, z: number): Area {
  if (officeAt(x, z)) return 'office';
  if (inConference(x, z)) return 'conference';
  if (x <= -OUT) return 'garden';
  if (within(GAME, x, z)) return 'game';
  if (within(CAFE, x, z)) return 'cafe';
  if (within(LIBRARY, x, z)) return 'library';
  if (z > H) return 'reception';
  return 'corridor';
}
export const onDanceFloor = (x: number, z: number) => Math.abs(x - DANCE_FLOOR.pos[0]) < DANCE_FLOOR.half && Math.abs(z - DANCE_FLOOR.pos[1]) < DANCE_FLOOR.half;

// Places the map can take you to: where you land and which way you look.
export interface Place { id: Area | `office-${number}`; pos: Vec2; yaw: number }
export function places(): Place[] {
  return [
    { id: 'reception', pos: [0, SOUTH - 2.2], yaw: 0 },
    { id: 'conference', pos: [0, CONF_RADIUS + 1.6], yaw: 0 },
    { id: 'cafe', pos: [-H - 1.2, 0], yaw: Math.PI / 2 },
    { id: 'library', pos: [H + 1.2, 0], yaw: -Math.PI / 2 },
    { id: 'game', pos: [0, -H - 1.3], yaw: 0 },
    { id: 'garden', pos: [-OUT - 1.6, 0], yaw: Math.PI / 2 },
    ...OFFICES.map((o): Place => ({ id: `office-${o.slot}`, pos: [(o.door.a[0] + o.door.b[0]) / 2, o.slot <= 2 ? -H + 1.3 : H - 1.3], yaw: o.slot <= 2 ? 0 : Math.PI })),
  ];
}

// Furniture from the Kenney Furniture Kit (CC0). size = target footprint width in metres.
export function props(): Prop[] {
  const p: Prop[] = [];
  for (const o of OFFICES) {
    const [x0, z0] = o.min, [x1, z1] = o.max;
    const cx = (x0 + x1) / 2;
    const north = o.slot <= 2;
    const back = north ? z0 : z1; // outer wall
    const inward = north ? 1 : -1;
    const rot = north ? 0 : Math.PI;
    const outerX = o.slot % 2 === 1 ? x0 : x1;
    const sideIn = o.slot % 2 === 1 ? 1 : -1;
    p.push({ model: 'desk', pos: [cx, back + inward * 1.5], rot, size: 1.6 });
    p.push({ model: 'computerScreen', pos: [cx, back + inward * 1.32], rot, size: 0.62, y: 0.84 });
    p.push({ model: 'computerKeyboard', pos: [cx, back + inward * 1.62], rot, size: 0.42, y: 0.84 });
    p.push({ model: 'chairDesk', pos: [cx, back + inward * 2.35], rot: rot + Math.PI, size: 0.62 });
    p.push({ model: 'lampRoundTable', pos: [cx + 0.6, back + inward * 1.3], rot, size: 0.22, y: 0.84 });
    p.push({ model: 'bookcaseOpen', pos: [outerX + sideIn * 0.3, back + inward * 3.4], rot: sideIn > 0 ? Math.PI / 2 : -Math.PI / 2, size: 1.0 });
    p.push({ model: 'pottedPlant', pos: [outerX + sideIn * 0.55, back + inward * 0.55], rot: 0, size: 0.55 });
    p.push({ model: 'lampRoundFloor', pos: [outerX + sideIn * 0.5, back + inward * 1.6], rot: 0, size: 0.38 });
    p.push({ model: 'rugRectangle', pos: [cx, back + inward * 2.7], rot, size: 3.6, y: 0.005 });
    p.push({ model: 'plantSmall2', pos: [cx - 0.62, back + inward * 1.3], rot: 0, size: 0.2, y: 0.84 });
  }
  // The conference room is built in code (ConferenceRoom.tsx).
  // Reception and entrance: a compact desk so the receptionist stays visible, her chair and computer.
  const [rx, rz] = RECEPTION.pos;
  p.push({ model: 'desk', pos: [rx, rz], rot: Math.PI, size: 1.6 });
  // Screen straight in front of her face and the keyboard right under her hands (owner request).
  p.push({ model: 'computerScreen', pos: [rx, rz - 0.02], rot: Math.PI, size: 0.5, y: 0.84 });
  p.push({ model: 'computerKeyboard', pos: [rx, rz - 0.3], rot: Math.PI, size: 0.4, y: 0.84 });
  p.push({ model: 'plantSmall3', pos: [rx + 0.6, rz + 0.1], rot: 0, size: 0.22, y: 0.84 });
  p.push({ model: 'chairDesk', pos: RECEPTIONIST_SEAT.pos, rot: 0, size: 0.62 });
  p.push({ model: 'rugDoormat', pos: [0, SOUTH - 0.5], rot: 0, size: 1.6, y: 0.005 });
  p.push({ model: 'pottedPlant', pos: [-H + 0.6, SOUTH - 0.6], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [H - 0.6, SOUTH - 0.6], rot: 0, size: 0.6 });
  p.push({ model: 'coatRackStanding', pos: [H - 0.5, SOUTH - 2.4], rot: 0, size: 0.5 });
  p.push({ model: 'benchCushion', pos: [-H + 0.5, SOUTH - 3.2], rot: Math.PI / 2, size: 1.4 });
  // Café (west arm): bar with the coffee machine, two round tables, a sofa nook by the garden glass.
  p.push({ model: 'kitchenCoffeeMachine', pos: COFFEE_MACHINE, rot: Math.PI / 2, size: 0.42, y: CAFE_BAR.height });
  for (const t of CAFE_TABLES) {
    p.push({ model: 'plantSmall1', pos: t, rot: 0, size: 0.18, y: CAFE_TABLE_HEIGHT });
  }
  for (const s of cafeSeats().filter((x) => /^cafe-\d/.test(x.id))) p.push({ model: 'chairModernCushion', pos: s.pos, rot: s.facing + Math.PI, size: 0.56 });
  p.push({ model: 'loungeSofa', pos: [CAFE_SOFA.pos[0] - 0.15, CAFE_SOFA.pos[1]], rot: Math.PI / 2, size: 2.2 });
  p.push({ model: 'tableCoffee', pos: [CAFE_SOFA.pos[0] + 1.25, CAFE_SOFA.pos[1]], rot: Math.PI / 2, size: 1.0 });
  p.push({ model: 'rugRound', pos: [CAFE_SOFA.pos[0] + 1.0, CAFE_SOFA.pos[1]], rot: 0, size: 2.6, y: 0.005 });
  p.push({ model: 'pottedPlant', pos: [-OUT + 0.55, 6.3], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [-OUT + 0.55, -6.4], rot: 0, size: 0.6 });
  p.push({ model: 'trashcan', pos: [-OUT + 0.4, -1.4], rot: 0, size: 0.35 });
  // Library (east arm): reading table and chairs, two armchairs with lamps (shelves and the pod are built in code).
  for (const s of librarySeats().filter((x) => x.id.startsWith('lib-') && !x.id.startsWith('lib-chair'))) p.push({ model: 'chairDesk', pos: s.pos, rot: s.facing + Math.PI, size: 0.58 });
  p.push({ model: 'lampSquareTable', pos: [LIB_TABLE.pos[0], LIB_TABLE.pos[1]], rot: 0, size: 0.24, y: LIB_TABLE.height });
  p.push({ model: 'books', pos: [LIB_TABLE.pos[0] + 0.1, LIB_TABLE.pos[1] - 0.75], rot: 0.4, size: 0.3, y: LIB_TABLE.height }, { model: 'laptop', pos: [LIB_TABLE.pos[0] - 0.15, LIB_TABLE.pos[1] + 0.65], rot: Math.PI / 2, size: 0.36, y: LIB_TABLE.height });
  for (const a of LIB_ARMCHAIRS) {
    p.push({ model: 'chairModernCushion', pos: a.pos, rot: a.facing + Math.PI, size: 0.7 });
    p.push({ model: 'lampRoundFloor', pos: [OUT - 0.45, a.pos[1] + Math.sign(a.pos[1]) * 0.45], rot: 0, size: 0.38 });
  }
  p.push({ model: 'rugRectangle', pos: LIB_TABLE.pos, rot: Math.PI / 2, size: 4.2, y: 0.005 });
  p.push({ model: 'pottedPlant', pos: [H + 0.55, 6.4], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [H + 0.55, -6.4], rot: 0, size: 0.6 });
  // Game room: a sofa in front of the TV (everything else there is built in code).
  p.push({ model: 'loungeSofa', pos: [GAME_SOFA[0], GAME_SOFA[1] + 0.15], rot: Math.PI, size: 2.2 });
  p.push({ model: 'cabinetTelevision', pos: [GAME_TV.x, -OUT + 0.3], rot: 0, size: 2.0 });
  p.push({ model: 'rugRectangle', pos: [GAME_SOFA[0], GAME_SOFA[1] - 1.3], rot: 0, size: 2.8, y: 0.005 });
  p.push({ model: 'pottedPlant', pos: [-H + 0.55, -OUT + 0.55], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [H - 0.55, -H - 0.55], rot: 0, size: 0.55 });
  for (const s of gameSeats().filter((x) => x.id.startsWith('xo-'))) p.push({ model: 'chairModernCushion', pos: s.pos, rot: s.facing + Math.PI, size: 0.56 });
  // Corridor corners.
  p.push({ model: 'pottedPlant', pos: [-H + 0.5, -H + 0.5], rot: 0, size: 0.55 }, { model: 'pottedPlant', pos: [H - 0.5, -H + 0.5], rot: 0, size: 0.55 });
  return p;
}

// Floor-standing furniture that blocks walking (approximate circles; radius as a share of the footprint).
const SOLID: Record<string, number> = { pottedPlant: 0.42, lampRoundFloor: 0.4, coatRackStanding: 0.45, trashcan: 0.5, sideTable: 0.45, bookcaseOpen: 0.45, cabinetTelevision: 0.3, chairDesk: 0.45, chairModernCushion: 0.45 };

// Solid obstacles (approximate circles) for the larger furniture, chairs included.
export function propColliders(): Circle[] {
  const c: Circle[] = [{ pos: [0, 0], r: CONF_TABLE_RADIUS - 0.05 }];
  for (const seat of conferenceSeats()) c.push({ pos: seat.pos, r: 0.28 });
  for (const pos of CONF_PLANTS) c.push({ pos, r: 0.3 });
  for (const o of OFFICES) {
    const cx = (o.min[0] + o.max[0]) / 2;
    const north = o.slot <= 2;
    const back = north ? o.min[1] : o.max[1];
    const inward = north ? 1 : -1;
    c.push({ pos: [cx - 0.5, back + inward * 1.5], r: 0.45 }, { pos: [cx + 0.5, back + inward * 1.5], r: 0.45 });
  }
  for (const t of CAFE_TABLES) c.push({ pos: t, r: CAFE_TABLE_RADIUS - 0.05 });
  c.push({ pos: [CAFE_SOFA.pos[0] + 1.25, CAFE_SOFA.pos[1]], r: 0.42 });
  for (const st of CAFE_STOOLS) c.push({ pos: st, r: 0.2 });
  c.push({ pos: WATER_COOLER, r: 0.25 });
  c.push({ pos: XO_TABLE, r: 0.5 });
  for (const bb of BEAN_BAGS) c.push({ pos: bb, r: 0.42 });
  c.push({ pos: FOUNTAIN.pos, r: FOUNTAIN.r });
  for (const t of GARDEN_TREES) c.push({ pos: t, r: 0.32 });
  c.push({ pos: [-H + 0.5, SOUTH - 3.5], r: 0.35 }, { pos: [-H + 0.5, SOUTH - 2.9], r: 0.35 }); // bench
  for (const p of props()) if (p.y === undefined && SOLID[p.model]) c.push({ pos: p.pos, r: p.size * SOLID[p.model] });
  return c;
}
