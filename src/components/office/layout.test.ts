import { describe, it, expect } from 'vitest';
import { buildWalls, doorSegments, officeAt, SPAWN, PLAYER_RADIUS, allSeats, OFFICES, propColliders } from './layout';
import { resolveCollisions } from './collision';

describe('office layout', () => {
  const walls = buildWalls();
  it('spawns inside the building, clear of walls', () => {
    expect(resolveCollisions(SPAWN.pos, PLAYER_RADIUS, walls)).toEqual(SPAWN.pos);
    expect(officeAt(...SPAWN.pos)).toBeNull();
  });
  it('blocks walking through a wall', () => {
    // Walk from the west corridor into office 1 through its glass wall (not the door).
    const [, z] = resolveCollisions([-6.5, -4.9], PLAYER_RADIUS, walls);
    expect(z).toBeGreaterThan(-5 + PLAYER_RADIUS - 1e-6);
  });
  it('lets the player through an open office door but not a closed one', () => {
    const doorMid: [number, number] = [(OFFICES[0].door.a[0] + OFFICES[0].door.b[0]) / 2, -5];
    expect(resolveCollisions(doorMid, PLAYER_RADIUS, walls)).toEqual(doorMid);
    const closed = resolveCollisions(doorMid, PLAYER_RADIUS, [...walls, ...doorSegments().filter((d) => d.slot === 1)]);
    expect(closed).not.toEqual(doorMid);
  });
  it('has reachable seats', () => {
    for (const s of allSeats()) expect(s.pos.every(Number.isFinite)).toBe(true);
    expect(officeAt(...allSeats()[0].pos)?.slot).toBe(1);
  });
  it('desk colliders do not overlap the chair seat', () => {
    const seat = allSeats()[0];
    const [x, z] = resolveCollisions(seat.pos, 0.05, [], propColliders());
    expect(Math.hypot(x - seat.pos[0], z - seat.pos[1])).toBeLessThan(0.01);
  });
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
