'use client';
import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { DOWNLIGHTS, LIGHT_POOL } from './lighting';
import { WALL_HEIGHT } from './layout';

// A fixed handful of ceiling downlights (wide soft cones towards the floor) that always sit at the
// fixtures nearest to the viewer. Every real light costs work on every surface of every frame, so the
// count stays the same however large the office grows; a light that moves fades in at its new place.
const REASSIGN_MS = 250;

export function LightPool() {
  const camera = useThree((s) => s.camera);
  const lights = useRef<(THREE.SpotLight | null)[]>([]);
  const slots = useRef(Array.from({ length: LIGHT_POOL }, () => ({ fixture: -1, fade: 0 })));
  const lastAssign = useRef(-1e9);
  const order = useRef(DOWNLIGHTS.map((_, i) => i));

  const place = (i: number) => {
    const l = lights.current[i], f = DOWNLIGHTS[slots.current[i].fixture];
    if (!l || !f) return;
    l.position.set(f.pos[0], WALL_HEIGHT - 0.05, f.pos[1]);
    l.target.position.set(f.pos[0], 0, f.pos[1]);
    l.target.updateMatrixWorld();
    l.color.set(f.color);
  };
  const assign = () => {
    const { x, z } = camera.position;
    const d = (i: number) => (DOWNLIGHTS[i].pos[0] - x) ** 2 + (DOWNLIGHTS[i].pos[1] - z) ** 2;
    order.current.sort((a, b) => d(a) - d(b));
    const wanted = order.current.slice(0, LIGHT_POOL);
    const free = wanted.filter((f) => !slots.current.some((s) => s.fixture === f));
    slots.current.forEach((s, i) => {
      if (wanted.includes(s.fixture)) return;
      const next = free.shift();
      if (next === undefined) return;
      s.fixture = next; s.fade = 0;
      place(i);
    });
  };
  useLayoutEffect(() => { assign(); slots.current.forEach((s) => { s.fade = 1; }); });
  useFrame((_, dt) => {
    const now = performance.now();
    if (now - lastAssign.current > REASSIGN_MS) { lastAssign.current = now; assign(); }
    slots.current.forEach((s, i) => {
      const l = lights.current[i];
      if (!l || s.fixture < 0) return;
      if (s.fade < 1) s.fade = Math.min(1, s.fade + dt * 2.5);
      const want = DOWNLIGHTS[s.fixture].intensity * s.fade;
      if (l.intensity !== want) l.intensity = want;
    });
  });
  return (
    <>
      {slots.current.map((_, i) => (
        <spotLight key={i} ref={(el) => { lights.current[i] = el; }} angle={1.2} penumbra={1} intensity={0} distance={11} decay={2} />
      ))}
    </>
  );
}
