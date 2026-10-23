'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { softShadow } from './textures';

const materials = new Map<number, THREE.MeshBasicMaterial>();
const material = (opacity: number) => {
  let m = materials.get(opacity);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: softShadow(), color: '#2b1d12', transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    materials.set(opacity, m);
  }
  return m;
};
const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// Soft contact shadow on the floor (a blurred dark ellipse). Grounds furniture and people on every
// device without real-time shadow maps.
export function GroundShadow({ pos = [0, 0], size, opacity = 0.35, y = 0.009, rotation = 0 }: {
  pos?: [number, number]; size: [number, number]; opacity?: number; y?: number; rotation?: number;
}) {
  const m = useMemo(() => material(Math.round(opacity * 20) / 20), [opacity]);
  return <mesh geometry={plane} material={m} position={[pos[0], y, pos[1]]} rotation-y={rotation} scale={[size[0], 1, size[1]]} renderOrder={1} />;
}
