import type { Office } from '@/lib/data/types';
import { buildWalls, CONF_RADIUS, type Segment, type Vec2 } from './layout';

// Whether walls hide one point of the floor plan from another (top view): solid walls, frosted glass
// (an office's, or the conference ring once it is mostly frosted) and the given door leaves block;
// clear glass does not. Used to hide the labels of people behind a wall, as their body is hidden.

const WALLS = buildWalls().filter((w) => w.kind === 'solid' || w.kind === 'glass');
const onConferenceRing = (w: Segment) => Math.abs(Math.hypot((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2) - CONF_RADIUS) < 0.2;
export const CONF_FROST_BLOCKS = 75; // frosting (0–100) from which the conference glass hides what is behind it

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
export function segmentsCross(p: Vec2, q: Vec2, a: Vec2, b: Vec2) {
  const d1 = cross(a, b, p), d2 = cross(a, b, q), d3 = cross(p, q, a), d4 = cross(p, q, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function sightBlocked(from: Vec2, to: Vec2, offices: Office[], confFrost: number, leaves: Segment[] = []) {
  for (const w of WALLS) {
    if (w.kind === 'glass') {
      const frosted = w.slot !== undefined
        ? offices.find((o) => o.slot === w.slot)?.glass === 'frosted'
        : onConferenceRing(w) && confFrost >= CONF_FROST_BLOCKS;
      if (!frosted) continue;
    }
    if (segmentsCross(from, to, w.a, w.b)) return true;
  }
  return leaves.some((l) => segmentsCross(from, to, l.a, l.b));
}
