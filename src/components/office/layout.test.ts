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
      const back: Vec2 = s.exit ?? [s.pos[0] + Math.sin(s.facing) * 0.75, s.pos[1] + Math.cos(s.facing) * 0.75];
      expect(moved(back, PLAYER_RADIUS, walls), s.id).toBeLessThan(0.05);
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
  const { entryDenied, doorAllowed } = await import('./Player');
  const office = { slot: 2, ownerId: 'owner', wallColor: 'teal' as const, glass: 'clear' as const, locked: false, focus: false, isPublic: false };
  it('owner always passes', () => expect(entryDenied({ ...office, locked: true }, 'owner', [])).toBe(false));
  it('private office needs an accepted invite', () => {
    expect(entryDenied(office, 'guest', [])).toBe(true);
    expect(entryDenied(office, 'guest', [2])).toBe(false);
  });
  it('public office is open unless locked or frosted', () => {
    expect(entryDenied({ ...office, isPublic: true }, 'guest', [])).toBe(false);
    expect(entryDenied({ ...office, isPublic: true, locked: true }, 'guest', [2])).toBe(true);
    expect(entryDenied({ ...office, isPublic: true, glass: 'frosted' }, 'guest', [])).toBe(true);
  });
  it('empty office is open', () => expect(entryDenied({ ...office, ownerId: null }, 'guest', [])).toBe(false));
  it('only those with access use the door, but anyone inside can get out', () => {
    const door = doors().find((d) => d.id === 'o2')!;
    const locked = [{ ...office, locked: true }];
    expect(doorAllowed(door, locked, 'owner', [])).toBe(true);
    expect(doorAllowed(door, locked, 'guest', [2])).toBe(false);
    expect(doorAllowed(door, locked, 'guest', [2], 2)).toBe(true);
    expect(doorAllowed(doors().find((d) => d.id === 'conf')!, locked, 'guest', [])).toBe(true);
  });
});

describe('second expansion: arcade hall, zen deck and idea lab', async () => {
  const { stations, GATE, LAB, HALL, places } = await import('./layout');
  const segs = [...walls, ...leaves(['game', 'conf'])];
  // Walks a straight line in small steps and reports whether anything pushed the walker aside.
  const clear = (a: Vec2, b: Vec2) => {
    for (let k = 0; k <= 1; k += 0.01) {
      const p: Vec2 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      if (moved(p, PLAYER_RADIUS, segs) > 0.01) return `blocked at ${p}`;
    }
    return 'clear';
  };
  it('the archway leads from the game room into the hall, and the gates from the garden out', () => {
    expect(clear([0, -12.6 - 0.5], [0, -18.8])).toBe('clear'); // up to the soccer table in the middle of the hall
    expect(clear([-1.6, -18.8], [-1.6, HALL.min[1] + 0.9])).toBe('clear'); // and past it to the big screen
    expect(areaAt(0, -18)).toBe('hall');
    expect(clear([GATE.x, -3], [GATE.x, -8])).toBe('clear');
    expect(clear([GATE.x, -8], [-19.1, -9.0])).toBe('clear'); // along the stepping stones to the deck
    expect(clear([GATE.x, 3], [GATE.x, 9.8])).toBe('clear');
    expect(clear([GATE.x, 9.8], [LAB.max[0] - 1.2, 9.8])).toBe('clear'); // to the whiteboards
    expect(areaAt(GATE.x, -10)).toBe('zen');
    expect(areaAt(GATE.x, 10)).toBe('lab');
    // Walls still hold: no way out of the hall through its side walls, nor past the hedge beside a gate.
    expect(moved([-H - 0.05, -18], PLAYER_RADIUS, segs)).toBeGreaterThan(0.1);
    expect(moved([GATE.x + GATE.half + 0.4, -H], PLAYER_RADIUS, segs)).toBeGreaterThan(0.1);
  });
  it('every station has a free spot within reach in front of it', () => {
    for (const st of stations()) {
      const ok = [0.8, 1.0, 1.2, 1.4].some((d) => [0, 0.5, -0.5, 1, -1].some((turn) => {
        const a = st.facing + turn;
        const p: Vec2 = [st.pos[0] + Math.sin(a) * d, st.pos[1] + Math.cos(a) * d];
        return moved(p, PLAYER_RADIUS, segs) < 0.01;
      }));
      expect(ok, st.id).toBe(true);
    }
  });
  it('the map lands on free ground in every place', () => {
    for (const p of places()) expect(moved(p.pos, PLAYER_RADIUS, segs), p.id).toBeLessThan(0.01);
  });
});
