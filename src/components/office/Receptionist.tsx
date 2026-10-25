'use client';
import { Suspense, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CharacterModel, CHARACTER_HEIGHT, type Motion } from '@/components/three/CharacterModel';
import { RECEPTIONIST_SEAT } from './layout';
import { Nameplate } from './Nameplate';
import { GroundShadow } from './GroundShadow';
import { tour, guide, me, pointAt, GUIDE_SPEED } from './tour';

export const RECEPTIONIST_CHARACTER = 'kaykit-ranger';
const SIT_Y = 0.08;

// The receptionist works at her computer behind the desk; for the tour she gets up, walks to each
// part of the office (paths from tour.ts) and comes back to sit down again.
export function Receptionist({ label }: { label: string }) {
  const group = useRef<THREE.Group>(null);
  const [motion, setMotion] = useState<Motion>('sit');
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const t = tour.get();
    const back = tour.returning();
    let m: Motion = 'sit';
    if (t.step !== null || back) {
      const path = t.step !== null ? t.guidePath : back!.path;
      const started = t.step !== null ? t.startedAt : back!.startedAt;
      const p = pointAt(path, ((performance.now() - started) / 1000) * GUIDE_SPEED);
      guide.pos = p.pos;
      guide.seated = false;
      guide.moving = !p.done;
      if (!p.done) guide.yaw = Math.atan2(p.dir[0], p.dir[1]);
      else if (t.step !== null) guide.yaw = Math.atan2(me.pos[0] - p.pos[0], me.pos[1] - p.pos[1]);
      m = p.done ? 'idle' : 'walk';
      if (p.done && t.step === null) {
        tour.doneReturning();
        guide.seated = true;
        guide.yaw = 0;
      }
    }
    if (guide.seated) { guide.pos = [...RECEPTIONIST_SEAT.pos]; guide.moving = false; m = 'sit'; }
    g.position.set(guide.pos[0], guide.seated ? SIT_Y : 0, guide.pos[1]);
    let d = guide.yaw - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * (1 - Math.exp(-dt * 8));
    if (m !== motion) setMotion(m);
  });
  return (
    <group ref={group} position={[RECEPTIONIST_SEAT.pos[0], 0, RECEPTIONIST_SEAT.pos[1]]}>
      <GroundShadow size={[0.75, 0.75]} opacity={0.35} y={0.01 - SIT_Y} />
      <Suspense fallback={null}><CharacterModel characterId={RECEPTIONIST_CHARACTER} motion={motion} typing={motion === 'sit'} /></Suspense>
      {motion === 'sit' && (
        <Html position={[0, CHARACTER_HEIGHT + 0.25, 0]} center zIndexRange={[10, 0]} style={{ direction: 'ltr' }}>
          <div className="-translate-y-full"><Nameplate name={label} crown typing /></div>
        </Html>
      )}
    </group>
  );
}
