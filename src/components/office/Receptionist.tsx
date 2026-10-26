'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CharacterModel, type HeadListener, type Motion } from '@/components/three/CharacterModel';
import { RECEPTIONIST_SEAT } from './layout';
import { GroundShadow } from './GroundShadow';
import { tour, guide, me, pointAt, GUIDE_SPEED } from './tour';
import { anchors } from './labels';

export const RECEPTIONIST_CHARACTER = 'kaykit-ranger';
const SIT_Y = 0.08;

// The receptionist works at her computer behind the desk; for the tour she gets up, walks to each
// part of the office (paths from tour.ts) and comes back to sit down again. Her name above the head is
// drawn by the page (OfficeLabels) while she sits; during the tour her speech panel takes its place.
export function Receptionist() {
  const group = useRef<THREE.Group>(null);
  const [motion, setMotion] = useState<Motion>('sit');
  const head = useRef<{ head: THREE.Object3D | null; top: number }>({ head: null, top: 0 });
  const onHead = useCallback<HeadListener>((bone, top) => {
    head.current = { head: bone, top };
    const a = anchors.get('receptionist');
    if (a) Object.assign(a, head.current);
  }, []);
  useEffect(() => {
    if (group.current) anchors.set('receptionist', { root: group.current, ...head.current, talk: 0, hidden: false });
    return () => { anchors.delete('receptionist'); };
  }, []);
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
    const anchor = anchors.get('receptionist');
    if (anchor) anchor.hidden = m !== 'sit';
  });
  return (
    <group ref={group} position={[RECEPTIONIST_SEAT.pos[0], 0, RECEPTIONIST_SEAT.pos[1]]}>
      <GroundShadow size={[0.75, 0.75]} opacity={0.35} y={0.01 - SIT_Y} />
      <Suspense fallback={null}><CharacterModel characterId={RECEPTIONIST_CHARACTER} motion={motion} typing={motion === 'sit'} onHead={onHead} /></Suspense>
    </group>
  );
}
