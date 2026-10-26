'use client';
import { useEffect, useRef } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Office } from '@/lib/data/types';
import { CHARACTER_HEIGHT } from '@/components/three/CharacterModel';
import { doorLeaf, type Vec2 } from './layout';
import { DOORS, doorAngles } from './doors';
import { roomControls } from './roomControls';
import { anchors, labelEls, labelScale, METRES_PER_PX } from './labels';
import { sightBlocked, CONF_FROST_BLOCKS } from './sight';

const v = new THREE.Vector3();
const NEAR = 0.25; // closer than this (metres in front of the eye) the label is not drawn

function hide(el: HTMLElement) {
  if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
}

// Places the labels above the heads (labels.ts) after every rendered frame, when the characters, their
// bones and the camera have all moved: at the top of the head, scaled like an object of the label's
// world size at that depth, nearer ones on top, and faded out behind walls, frosted glass or a door.
export function LabelProjector({ offices }: { offices: Office[] }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const live = useRef({ camera, size, offices });
  live.current = { camera, size, offices };
  useEffect(() => {
    const smoothY = new Map<string, number>();
    let last = performance.now();
    return addAfterEffect(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { camera, size, offices } = live.current;
      const cam = camera as THREE.PerspectiveCamera;
      const frost = roomControls.get().frost;
      const leaves = DOORS.filter((d) => d.kind !== 'conference' || frost >= CONF_FROST_BLOCKS).map((d) => doorLeaf(d, doorAngles.get(d.id) ?? d.closed));
      const eye: Vec2 = [cam.position.x, cam.position.z];
      for (const [id, el] of labelEls) {
        const a = anchors.get(id);
        if (!a || a.hidden) { hide(el); smoothY.delete(id); continue; }
        // Top of the head: the head bone plus the head's height, or the model's full height without one.
        if (a.head) { a.head.getWorldPosition(v); v.y += a.top; } else { a.root.getWorldPosition(v); v.y += CHARACTER_HEIGHT; }
        // The head bobs with every step; the label follows its height a little more calmly.
        const prev = smoothY.get(id);
        const y = prev === undefined ? v.y : prev + (v.y - prev) * (1 - Math.exp(-dt * 12));
        smoothY.set(id, y);
        const foot: Vec2 = [v.x, v.z];
        v.y = y;
        v.applyMatrix4(cam.matrixWorldInverse);
        const depth = -v.z;
        if (depth < NEAR) { hide(el); continue; }
        v.applyMatrix4(cam.projectionMatrix);
        const x = (v.x + 1) / 2 * size.width, sy = (1 - v.y) / 2 * size.height;
        const scale = labelScale(depth, cam.fov, size.height);
        el.style.visibility = 'visible';
        el.style.transform = `translate3d(${x.toFixed(1)}px,${sy.toFixed(1)}px,0) scale(${scale.toFixed(4)})`;
        el.style.zIndex = String(Math.max(1, Math.round(10000 - depth * 100)));
        const blocked = sightBlocked(eye, foot, offices, frost, leaves);
        el.style.opacity = blocked ? '0' : '1';
        if (el.inert !== blocked) el.inert = blocked; // no taps on a label hidden behind a wall
        el.style.setProperty('--talk', a.talk.toFixed(2));
        el.style.setProperty('--head', `${Math.round((a.top || 0.5) / METRES_PER_PX)}px`);
      }
    });
  }, []);
  return null;
}
