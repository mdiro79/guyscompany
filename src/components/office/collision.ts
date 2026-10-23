import type { Segment, Vec2 } from './layout';

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return [a[0] + abx * t, a[1] + abz * t];
}

// Pushes a circle out of wall segments and round obstacles (a few iterations for corners).
export function resolveCollisions(pos: Vec2, radius: number, walls: Segment[], circles: { pos: Vec2; r: number }[] = []): Vec2 {
  let [x, z] = pos;
  for (let iter = 0; iter < 3; iter++) {
    for (const w of walls) {
      const [cx, cz] = closestOnSegment([x, z], w.a, w.b);
      const dx = x - cx, dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d < radius) {
        const nx = d > 1e-6 ? dx / d : 0, nz = d > 1e-6 ? dz / d : 1;
        x = cx + nx * radius;
        z = cz + nz * radius;
      }
    }
    for (const c of circles) {
      const dx = x - c.pos[0], dz = z - c.pos[1];
      const d = Math.hypot(dx, dz), min = c.r + radius;
      if (d < min && d > 1e-6) { x = c.pos[0] + (dx / d) * min; z = c.pos[1] + (dz / d) * min; }
    }
  }
  return [x, z];
}
