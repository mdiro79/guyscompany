'use client';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { roomControls } from './roomControls';

// Shared materials of the conference room's glass ring and glass door. The frosting (0–100 from the wall
// panel) fades them smoothly from clear tinted glass to milky white; the eye-level band fades out with it.
const CLEAR = new THREE.Color('#c9e6e3');
const FROSTED = new THREE.Color('#f4f1ec');

export const confGlass = {
  pane: new THREE.MeshStandardMaterial({ color: CLEAR.clone(), transparent: true, opacity: 0.3, roughness: 0.04, metalness: 0.15, envMapIntensity: 2, depthWrite: false }),
  band: new THREE.MeshStandardMaterial({ color: '#f7f4ee', transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false }),
};

let shown = -1;
export function useConferenceGlass() {
  useFrame((_, dt) => {
    const target = roomControls.get().frost / 100;
    shown = shown < 0 ? target : shown + (target - shown) * (1 - Math.exp(-dt * 5));
    const f = shown;
    confGlass.pane.color.lerpColors(CLEAR, FROSTED, f);
    confGlass.pane.opacity = 0.3 + 0.62 * f;
    confGlass.pane.roughness = 0.04 + 0.86 * f;
    confGlass.pane.metalness = 0.15 * (1 - f);
    confGlass.pane.depthWrite = f > 0.75; // solid enough to hide what is behind it
    confGlass.band.opacity = 0.55 * (1 - f);
  });
}
