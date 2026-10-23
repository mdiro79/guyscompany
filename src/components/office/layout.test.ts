import { describe, it, expect } from 'vitest';
import {
  buildWalls, doorSegments, doors, doorLeaf, doorCenter, officeAt, areaAt, SPAWN, PLAYER_RADIUS, allSeats, conferenceSeats, OFFICES, propColliders,
  H, SOUTH, PORCH, CONF_RADIUS, RECEPTIONIST_SEAT, type Vec2, type Segment,
} from './layout';
import { resolveCollisions } from './collision';
import { tourSteps, pointAt, pathLength } from './tour';

const walls = buildWalls();
const props = propColliders();
const leaves = (open: string[]) => doors().map((d) => doorLeaf(d, open.includes(d.id) ? d.open : d.closed));
const moved = (p: Vec2, r: number, segs: Segment[], circles = props) => {
  const [x, z] = resolveCollisions(p, r, segs, circles);
  return Math.hypot(x - p[0], z - p[1]);
};

describe('office layout', () => {
  it('spawns inside the building, clear of walls and furniture', () => {
    expect(moved(SPAWN.pos, PLAYER_RADIUS, [...walls, ...leaves([])])).toBeLessThan(1e-6);
    expect(areaAt(...SPAWN.pos)).toBe('reception');
  });
  it('blocks walking through a glass office wall', () => {
    // Walk from the west arm into office 1 through its glass wall (not the door).
    const [, z] = resolveCollisions([-H - 1, -H + 0.1], PLAYER_RADIUS, walls);
    expect(z).toBeGreaterThan(-H + PLAYER_RADIUS - 1e-6);
  });
  it('lets the player through an open door but not a closed one', () => {
    const d = doors().find((x) => x.id === 'o1')!;
    const mid = doorCenter(d);
    expect(moved(mid, PLAYER_RADIUS, [...walls, ...leaves(['o1'])])).toBeLessThan(1e-6);
    expect(moved(mid, PLAYER_RADIUS, [...walls, ...leaves([])])).toBeGreaterThan(0.1);
    // Without access the doorway stays blocked even when the leaf is open.
    expect(moved(mid, PLAYER_RADIUS, [...walls, ...leaves(['o1']), ...doorSegments().filter((s) => s.slot === 1)])).toBeGreaterThan(0.1);
  });
  it('closes the entrance with a glass porch (no walking into the void)', () => {
    let p: Vec2 = [0, SOUTH + 0.8];
    expect(moved(p, PLAYER_RADIUS, walls)).toBeLessThan(1e-6); // inside the porch
    for (let i = 0; i < 200; i++) p = resolveCollisions([p[0], p[1] + 0.05], PLAYER_RADIUS, walls);
    expect(p[1]).toBeLessThanOrEqual(SOUTH + PORCH - PLAYER_RADIUS + 1e-6);
  });
  it('has reachable seats and room to stand up behind each chair', () => {
    for (const s of allSeats()) {
      expect(s.pos.every(Number.isFinite)).toBe(true);
      const back: Vec2 = [s.pos[0] + Math.sin(s.facing) * 0.75, s.pos[1] + Math.cos(s.facing) * 0.75];
      if (s.area !== 'lounge') expect(moved(back, PLAYER_RADIUS, walls)).toBeLessThan(0.05);
    }
    expect(officeAt(...allSeats()[0].pos)?.slot).toBe(1);
  });
  it('chairs are solid (you cannot walk through them)', () => {
    const near = (p: Vec2): Vec2 => [p[0] + 0.1, p[1]];
    for (const s of [...conferenceSeats(), allSeats()[0]]) expect(moved(near(s.pos), PLAYER_RADIUS, [])).toBeGreaterThan(0.3);
    expect(moved(near(RECEPTIONIST_SEAT.pos), PLAYER_RADIUS, [])).toBeGreaterThan(0.3);
  });
  it('leaves a comfortable walkway around the conference table', () => {
    const chair = conferenceSeats()[0];
    expect(CONF_RADIUS - Math.hypot(...chair.pos) - 0.3).toBeGreaterThan(1.5);
    for (const o of OFFICES) expect(o.max[0] - o.min[0]).toBeGreaterThanOrEqual(8);
  });
});

describe('receptionist tour', () => {
  for (const slot of [1, 2, 3, 4]) {
    for (const own of [true, false]) {
      it(`walks clear paths (office ${slot}, ${own ? 'own' : 'visitor'})`, () => {
        const steps = tourSteps(slot, own);
        let player: Vec2 = [0, RECEPTIONIST_SEAT.pos[1] + 3.6];
        let guide: Vec2 = RECEPTIONIST_SEAT.pos;
        const open = ['conf'];
        for (const s of steps) {
          if (s.openDoor) open.push(s.openDoor);
          const segs = [...walls, ...leaves(open)];
          const pp: Vec2[] = [player, ...s.player];
          for (let d = 0; d <= pathLength(pp); d += 0.1) {
            const p = pointAt(pp, d).pos;
            expect(moved(p, PLAYER_RADIUS - 0.05, segs), `${s.key} player at ${p}`).toBeLessThan(0.01);
          }
          const gp: Vec2[] = [guide, ...s.guide];
          // The receptionist's own chair is skipped (she gets up from and sits down on it).
          const others = props.filter((c) => Math.hypot(c.pos[0] - RECEPTIONIST_SEAT.pos[0], c.pos[1] - RECEPTIONIST_SEAT.pos[1]) > 0.01);
          for (let d = 0; d <= pathLength(gp); d += 0.1) {
            const p = pointAt(gp, d).pos;
            const nearSeat = Math.hypot(p[0] - RECEPTIONIST_SEAT.pos[0], p[1] - RECEPTIONIST_SEAT.pos[1]) < 0.4;
            if (!nearSeat) expect(moved(p, 0.2, segs, others), `${s.key} guide at ${p}`).toBeLessThan(0.01);
          }
          player = pp.at(-1)!;
          guide = gp.at(-1)!;
        }
        expect(guide).toEqual(RECEPTIONIST_SEAT.pos);
      });
    }
  }
});

describe('door rules', async () => {
  const { isDoorClosed } = await import('./Player');
  const office = { slot: 2, ownerId: 'owner', wallColor: 'teal' as const, glass: 'clear' as const, locked: false, focus: false, isPublic: false };
  it('owner always passes', () => expect(isDoorClosed({ ...office, locked: true }, 'owner', [])).toBe(false));
  it('private office needs an accepted invite', () => {
    expect(isDoorClosed(office, 'guest', [])).toBe(true);
    expect(isDoorClosed(office, 'guest', [2])).toBe(false);
  });
  it('public office is open unless locked or frosted', () => {
    expect(isDoorClosed({ ...office, isPublic: true }, 'guest', [])).toBe(false);
    expect(isDoorClosed({ ...office, isPublic: true, locked: true }, 'guest', [2])).toBe(true);
    expect(isDoorClosed({ ...office, isPublic: true, glass: 'frosted' }, 'guest', [])).toBe(true);
  });
  it('empty office is open', () => expect(isDoorClosed({ ...office, ownerId: null }, 'guest', [])).toBe(false));
});
