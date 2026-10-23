// Floor plan of the office in metres (top view). +Z points to the entrance (south), +X to the east.
// Corridors form a "+" around the round glass conference room; the four offices sit in the corners;
// reception faces the entrance door. Decorative parts without a function were dropped (owner decision).

export type Vec2 = [number, number];
export interface Segment { a: Vec2; b: Vec2; kind: 'solid' | 'glass' | 'door' | 'obstacle'; slot?: number }
export interface Seat { id: string; pos: Vec2; facing: number; slot?: number; monitor?: { pos: [number, number, number]; facing: number }; area: 'office' | 'conference' | 'lounge' }
export interface Prop { model: string; pos: Vec2; rot: number; size: number; y?: number }
export interface OfficeRoom { slot: number; min: Vec2; max: Vec2; door: { a: Vec2; b: Vec2 }; wallColor: 'orange' | 'teal' }

export const WALL_HEIGHT = 3;
export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;
export const H = 5; // corridor half width around the centre
export const OUT = 12; // outer extent of offices
export const SOUTH = 13; // entrance wall (vestibule protrudes 1 m)
export const CONF_RADIUS = 3;
export const CONF_DOOR_HALF_ANGLE = 0.32; // radians, door gap facing south

// Each office: slot, bounds, door in the wall facing the east/west corridor arm.
export const OFFICES: OfficeRoom[] = [
  { slot: 1, min: [-OUT, -OUT], max: [-H, -H], door: { a: [-9.6, -H], b: [-8.2, -H] }, wallColor: 'orange' },
  { slot: 2, min: [H, -OUT], max: [OUT, -H], door: { a: [8.2, -H], b: [9.6, -H] }, wallColor: 'teal' },
  { slot: 3, min: [-OUT, H], max: [-H, OUT], door: { a: [-9.6, H], b: [-8.2, H] }, wallColor: 'teal' },
  { slot: 4, min: [H, H], max: [OUT, OUT], door: { a: [8.2, H], b: [9.6, H] }, wallColor: 'orange' },
];

export const SPAWN: { pos: Vec2; yaw: number } = { pos: [0, 11.6], yaw: 0 }; // by the entrance, facing reception (north)
export const RECEPTION: { pos: Vec2; facing: number } = { pos: [0, 9.2], facing: 0 };
export const RECEPTIONIST_POS: Vec2 = [0, 8.1];

const seg = (a: Vec2, b: Vec2, kind: Segment['kind'] = 'solid', slot?: number): Segment => ({ a, b, kind, slot });

// Splits a wall from a to b around a door gap [d0, d1] (points on the wall).
function wallWithDoor(a: Vec2, b: Vec2, d0: Vec2, d1: Vec2, kind: Segment['kind'], slot: number): Segment[] {
  return [seg(a, d0, kind, slot), seg(d0, d1, 'door', slot), seg(d1, b, kind, slot)];
}

export function buildWalls(): Segment[] {
  const w: Segment[] = [];
  // Outer shell (clockwise from north-west office).
  w.push(seg([-OUT, -OUT], [-H, -OUT]), seg([-H, -OUT], [-H, -H]), seg([-H, -H], [H, -H]), seg([H, -H], [H, -OUT]), seg([H, -OUT], [OUT, -OUT]));
  w.push(seg([OUT, -OUT], [OUT, -H]), seg([OUT, -H], [OUT, H]), seg([OUT, H], [OUT, OUT]), seg([OUT, OUT], [H, OUT]), seg([H, OUT], [H, SOUTH]));
  w.push(seg([H, SOUTH], [0.9, SOUTH]), seg([-0.9, SOUTH], [-H, SOUTH])); // entrance gap 1.8 m (open door)
  w.push(seg([-H, SOUTH], [-H, OUT]), seg([-H, OUT], [-OUT, OUT]), seg([-OUT, OUT], [-OUT, H]), seg([-OUT, H], [-OUT, -H]), seg([-OUT, -H], [-OUT, -OUT]));
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
  // Conference room: glass ring with a door gap facing south.
  const n = 28;
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
    const mid = (t0 + t1) / 2;
    // angle 0 = south (+Z)
    const isDoor = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < CONF_DOOR_HALF_ANGLE;
    if (isDoor) continue;
    w.push(seg([Math.sin(t0) * CONF_RADIUS, Math.cos(t0) * CONF_RADIUS], [Math.sin(t1) * CONF_RADIUS, Math.cos(t1) * CONF_RADIUS], 'glass'));
  }
  // Reception desk as a solid obstacle.
  w.push(...([[[-1.2, 8.6], [1.2, 8.6]], [[1.2, 8.6], [1.2, 9.8]], [[1.2, 9.8], [-1.2, 9.8]], [[-1.2, 9.8], [-1.2, 8.6]]] as [Vec2, Vec2][]).map(([a, b]) => seg(a, b, 'obstacle')));
  return w.filter((s) => s.kind !== 'door');
}

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

export function conferenceSeats(): Seat[] {
  return Array.from({ length: 6 }, (_, i) => {
    const t = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const r = 1.55;
    const pos: Vec2 = [Math.sin(t) * r, Math.cos(t) * r];
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
  const confDoor: Vec2 = [0, CONF_RADIUS + 0.4];
  const lines: { color: 'orange' | 'teal'; points: Vec2[] }[] = [
    { color: 'orange', points: [[0.25, 12.4], [0.25, 7.6], [1.6, 7.0], [1.6, 4.6], [0.25, confDoor[1]]] },
  ];
  for (const o of OFFICES) {
    const dx = (o.door.a[0] + o.door.b[0]) / 2;
    const north = o.slot <= 2;
    const side = Math.sign(dx);
    const color = o.wallColor;
    const zDoor = north ? -H + 0.4 : H - 0.4;
    lines.push({ color, points: [[side * 0.6, 7.4], [side * 3.6, 6.6], [side * (H + 0.9), north ? 3.2 : 4.2], [dx, north ? -1.2 : 3.0], [dx, zDoor]].map(([x, z]) => [x, z] as Vec2) });
  }
  return lines;
}

export function officeAt(x: number, z: number): OfficeRoom | null {
  return OFFICES.find((o) => x > o.min[0] && x < o.max[0] && z > o.min[1] && z < o.max[1]) ?? null;
}

export const inConference = (x: number, z: number) => Math.hypot(x, z) < CONF_RADIUS;

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
    p.push({ model: 'bookcaseOpen', pos: [outerX + sideIn * 0.3, back + inward * 3.2], rot: sideIn > 0 ? Math.PI / 2 : -Math.PI / 2, size: 1.0 });
    p.push({ model: 'pottedPlant', pos: [outerX + sideIn * 0.55, back + inward * 0.55], rot: 0, size: 0.55 });
    p.push({ model: 'lampRoundFloor', pos: [outerX + sideIn * 0.5, back + inward * 1.6], rot: 0, size: 0.38 });
    p.push({ model: 'rugRectangle', pos: [cx, back + inward * 2.6], rot, size: 3.2, y: 0.005 });
    p.push({ model: 'plantSmall2', pos: [cx - 0.62, back + inward * 1.3], rot: 0, size: 0.2, y: 0.84 });
  }
  // Conference room.
  p.push({ model: 'tableRound', pos: [0, 0], rot: 0, size: 2.1 });
  for (const s of conferenceSeats()) p.push({ model: 'chairModernCushion', pos: s.pos, rot: s.facing + Math.PI, size: 0.6 });
  p.push({ model: 'televisionModern', pos: [0, -CONF_RADIUS + 0.35], rot: 0, size: 1.7, y: 0.55 });
  p.push({ model: 'cabinetTelevision', pos: [0, -CONF_RADIUS + 0.45], rot: 0, size: 1.5 });
  p.push({ model: 'pottedPlant', pos: [-1.9, -2.0], rot: 0, size: 0.55 }, { model: 'pottedPlant', pos: [1.9, -2.0], rot: 0, size: 0.55 });
  p.push({ model: 'plantSmall1', pos: [0.25, 0.1], rot: 0, size: 0.28, y: 0.78 });
  p.push({ model: 'laptop', pos: [0.6, -0.3], rot: 0.4, size: 0.4, y: 0.78 });
  p.push({ model: 'rugRound', pos: [0, 0], rot: 0, size: 5.2, y: 0.005 });
  // Reception and entrance.
  p.push({ model: 'desk', pos: [0, 9.2], rot: Math.PI, size: 2.4 });
  p.push({ model: 'computerScreen', pos: [-0.55, 9.0], rot: Math.PI, size: 0.55, y: 1.26 });
  p.push({ model: 'pottedPlant', pos: [0.85, 9.3], rot: 0, size: 0.3, y: 1.26 });
  p.push({ model: 'rugDoormat', pos: [0, 12.5], rot: 0, size: 1.6, y: 0.005 });
  p.push({ model: 'pottedPlant', pos: [-H + 0.6, SOUTH - 0.6], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [H - 0.6, SOUTH - 0.6], rot: 0, size: 0.6 });
  p.push({ model: 'coatRackStanding', pos: [H - 0.5, 10.2], rot: 0, size: 0.5 });
  // Lounges in the east and west arms (seating = function).
  p.push({ model: 'loungeSofa', pos: [-OUT + 0.6, 0], rot: Math.PI / 2, size: 2.2 }, { model: 'loungeSofa', pos: [OUT - 0.6, 0], rot: -Math.PI / 2, size: 2.2 });
  p.push({ model: 'tableCoffee', pos: [-OUT + 1.9, 0], rot: Math.PI / 2, size: 1.1 }, { model: 'tableCoffee', pos: [OUT - 1.9, 0], rot: Math.PI / 2, size: 1.1 });
  p.push({ model: 'kitchenCoffeeMachine', pos: [OUT - 0.4, -2.4], rot: -Math.PI / 2, size: 0.4, y: 0.8 }, { model: 'sideTable', pos: [OUT - 0.4, -2.4], rot: -Math.PI / 2, size: 0.7 });
  p.push({ model: 'pottedPlant', pos: [-OUT + 0.5, -4.4], rot: 0, size: 0.6 }, { model: 'pottedPlant', pos: [OUT - 0.5, 4.4], rot: 0, size: 0.6 });
  p.push({ model: 'pottedPlant', pos: [-H + 0.5, -H + 0.5], rot: 0, size: 0.55 }, { model: 'pottedPlant', pos: [H - 0.5, -H + 0.5], rot: 0, size: 0.55 });
  p.push({ model: 'trashcan', pos: [-OUT + 0.4, 3.0], rot: 0, size: 0.35 });
  return p;
}

// Solid obstacles (approximate circles) for the larger furniture.
export function propColliders(): { pos: Vec2; r: number }[] {
  const c: { pos: Vec2; r: number }[] = [{ pos: [0, 0], r: 1.15 }];
  for (const o of OFFICES) {
    const cx = (o.min[0] + o.max[0]) / 2;
    const north = o.slot <= 2;
    const back = north ? o.min[1] : o.max[1];
    const inward = north ? 1 : -1;
    c.push({ pos: [cx - 0.5, back + inward * 1.5], r: 0.45 }, { pos: [cx + 0.5, back + inward * 1.5], r: 0.45 });
  }
  c.push({ pos: [-OUT + 0.6, 0], r: 0.7 }, { pos: [OUT - 0.6, 0], r: 0.7 }, { pos: [-OUT + 1.9, 0], r: 0.45 }, { pos: [OUT - 1.9, 0], r: 0.45 });
  return c;
}
