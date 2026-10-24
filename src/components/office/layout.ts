// Floor plan of the office in metres (top view). +Z points to the entrance (south), +X to the east.
// Corridors form a "+" around the round glass conference room; the four offices sit in the corners;
// reception faces the entrance door. Decorative parts without a function were dropped (owner decision).

export type Vec2 = [number, number];
export interface Segment { a: Vec2; b: Vec2; kind: 'solid' | 'glass' | 'door' | 'obstacle'; slot?: number }
export interface Seat { id: string; pos: Vec2; facing: number; slot?: number; monitor?: { pos: [number, number, number]; facing: number }; area: 'office' | 'conference' | 'lounge' }
export interface Prop { model: string; pos: Vec2; rot: number; size: number; y?: number; h?: number } // h = target height (else uniform scale)
export interface OfficeRoom { slot: number; min: Vec2; max: Vec2; door: { a: Vec2; b: Vec2 }; wallColor: 'orange' | 'teal' }
export type Circle = { pos: Vec2; r: number };
// A hinged door leaf. Angles are directions in the floor plane (atan2 of z, x) from the hinge to the free end.
export interface DoorDef { id: string; kind: 'office' | 'conference' | 'entrance'; slot?: number; hinge: Vec2; width: number; closed: number; open: number; defaultOpen: boolean }

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
  // Outer shell (clockwise from north-west office).
  w.push(seg([-OUT, -OUT], [-H, -OUT]), seg([-H, -OUT], [-H, -H]), seg([-H, -H], [H, -H]), seg([H, -H], [H, -OUT]), seg([H, -OUT], [OUT, -OUT]));
  w.push(seg([OUT, -OUT], [OUT, -H]), seg([OUT, -H], [OUT, H]), seg([OUT, H], [OUT, OUT]), seg([OUT, OUT], [H, OUT]), seg([H, OUT], [H, SOUTH]));
  w.push(seg([H, SOUTH], [ENTRANCE_HALF, SOUTH]), seg([-ENTRANCE_HALF, SOUTH], [-H, SOUTH])); // entrance gap (door leaf in doors())
  w.push(seg([-H, SOUTH], [-H, OUT]), seg([-H, OUT], [-OUT, OUT]), seg([-OUT, OUT], [-OUT, H]), seg([-OUT, H], [-OUT, -H]), seg([-OUT, -H], [-OUT, -OUT]));
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

export function loungeSeats(): Seat[] {
  return [
    { id: 'lounge-w', pos: [-OUT + 0.7, 0], facing: -Math.PI / 2, area: 'lounge' },
    { id: 'lounge-e', pos: [OUT - 0.7, 0], facing: Math.PI / 2, area: 'lounge' },
  ];
}

export const allSeats = () => [...officeSeats(), ...conferenceSeats(), ...loungeSeats()];

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

export type Area = 'office' | 'conference' | 'reception' | 'lounge' | 'corridor';
export function areaAt(x: number, z: number): Area {
  if (officeAt(x, z)) return 'office';
  if (inConference(x, z)) return 'conference';
  if (z > H) return 'reception';
  if (Math.abs(x) > H) return 'lounge';
  return 'corridor';
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
  // Lounges in the east and west arms (seating = function).
  p.push({ model: 'loungeSofa', pos: [-OUT + 0.6, 0], rot: Math.PI / 2, size: 2.2 }, { model: 'loungeSofa', pos: [OUT - 0.6, 0], rot: -Math.PI / 2, size: 2.2 });
  p.push({ model: 'tableCoffee', pos: [-OUT + 1.9, 0], rot: Math.PI / 2, size: 1.1 }, { model: 'tableCoffee', pos: [OUT - 1.9, 0], rot: Math.PI / 2, size: 1.1 });
  p.push({ model: 'kitchenCoffeeMachine', pos: [OUT - 0.4, -2.4], rot: -Math.PI / 2, size: 0.4, y: 0.8 }, { model: 'sideTable', pos: [OUT - 0.4, -2.4], rot: -Math.PI / 2, size: 0.7 });
  p.push({ model: 'pottedPlant', pos: [-OUT + 0.5, -H + 0.6], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [OUT - 0.5, H - 0.6], rot: 0, size: 0.6 });
  p.push({ model: 'pottedPlant', pos: [-OUT + 0.5, H - 0.6], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [OUT - 0.5, -H + 0.6], rot: 0, size: 0.6 });
  p.push({ model: 'pottedPlant', pos: [-H + 0.5, -H + 0.5], rot: 0, size: 0.55 }, { model: 'pottedPlant', pos: [H - 0.5, -H + 0.5], rot: 0, size: 0.55 });
  p.push({ model: 'trashcan', pos: [-OUT + 0.4, 3.0], rot: 0, size: 0.35 });
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
  c.push({ pos: [-OUT + 0.6, 0], r: 0.7 }, { pos: [OUT - 0.6, 0], r: 0.7 }, { pos: [-OUT + 1.9, 0], r: 0.45 }, { pos: [OUT - 1.9, 0], r: 0.45 });
  c.push({ pos: [-H + 0.5, SOUTH - 3.5], r: 0.35 }, { pos: [-H + 0.5, SOUTH - 2.9], r: 0.35 }); // bench
  for (const p of props()) if (p.y === undefined && SOLID[p.model]) c.push({ pos: p.pos, r: p.size * SOLID[p.model] });
  return c;
}
