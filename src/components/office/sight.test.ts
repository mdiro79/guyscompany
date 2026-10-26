import { describe, it, expect } from 'vitest';
import type { Office } from '@/lib/data/types';
import { sightBlocked, segmentsCross } from './sight';
import { doors, doorLeaf, H } from './layout';
import { labelScale, METRES_PER_PX } from './labels';

const office = (slot: number, glass: 'clear' | 'frosted'): Office => ({ slot, ownerId: 'x', wallColor: 'teal', glass, locked: false, focus: false, isPublic: false });

describe('labels behind walls', () => {
  it('crossing test', () => {
    expect(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsCross([0, 0], [1, 1], [0, 2], [2, 4])).toBe(false);
  });
  it('a corridor is clear; the outer shell blocks', () => {
    expect(sightBlocked([0, 14], [0, 8], [], 0)).toBe(false);
    expect(sightBlocked([-11, -5], [-11, -20], [], 0)).toBe(true);
  });
  it('clear office glass shows who is inside, frosted glass hides them', () => {
    // From the south-west corridor into office 3 (south-west) through its glass wall.
    const from: [number, number] = [-5, 9], to: [number, number] = [-11, 11];
    expect(sightBlocked(from, to, [office(3, 'clear')], 0)).toBe(false);
    expect(sightBlocked(from, to, [office(3, 'frosted')], 0)).toBe(true);
  });
  it('a closed door blocks, an open one does not', () => {
    const d = doors().find((x) => x.id === 'o1')!;
    const from: [number, number] = [-11, -H + 2], to: [number, number] = [-11 + 0.0, -H - 2];
    const closed = [doorLeaf(d, d.closed)], open = [doorLeaf(d, d.open)];
    expect(sightBlocked(from, to, [office(1, 'clear')], 0, closed)).toBe(true);
    expect(sightBlocked(from, to, [office(1, 'clear')], 0, open)).toBe(false);
  });
  it('the conference ring hides people only when mostly frosted', () => {
    expect(sightBlocked([0, 8], [-2.5, -1], [], 0)).toBe(false);
    expect(sightBlocked([5.5, 3], [-2.5, -1], [], 90)).toBe(true);
  });
});

describe('label size', () => {
  it('matches the size of a real object at that depth', () => {
    // 100 px of label = 0.3 m; at 2 m with a 60° field of view on a 1000 px tall screen that is
    // 0.3 / (2 * 2 * tan 30°) * 1000 px ≈ 129.9 px.
    expect(100 * labelScale(2, 60, 1000)).toBeCloseTo((100 * METRES_PER_PX * 1000) / (4 * Math.tan(Math.PI / 6)), 6);
    expect(labelScale(4, 60, 1000)).toBeCloseTo(labelScale(2, 60, 1000) / 2, 9);
  });
});
