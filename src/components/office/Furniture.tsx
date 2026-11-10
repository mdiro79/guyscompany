'use client';
import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { props, areaAt, officeAt } from './layout';
import { Batch, batchMaterials } from './batch';
import { softShadow } from './textures';

// Furniture from the Kenney kit (CC0). The models ship with unlit flat colours; every piece is baked
// into one lit mesh per room (the colour becomes a vertex colour), and the soft contact shadows under
// them into another. A room full of furniture is two draw calls instead of a few hundred.

const LIST = props();
export const FURNITURE_MODELS = [...new Set(LIST.map((p) => p.model))];
const URLS = FURNITURE_MODELS.map((m) => `/models/furniture/${m}.glb`);
URLS.forEach((u) => useGLTF.preload(u));

const shadowMaterial = (() => {
  let m: THREE.Material | null = null;
  return () => (m ??= new THREE.MeshBasicMaterial({ map: softShadow(), color: '#2b1d12', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
})();
const SHADOW_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const zoneOf = (x: number, z: number) => { const o = officeAt(x, z); return o ? `office-${o.slot}` : areaAt(x, z); };

function bake(scenes: THREE.Object3D[]) {
  const zones = new Map<string, { solid: Batch; shadow: Batch }>();
  const box = new THREE.Box3(), size = new THREE.Vector3(), center = new THREE.Vector3();
  const white = new THREE.Color('#cccccc');
  for (const prop of LIST) {
    const scene = scenes[FURNITURE_MODELS.indexOf(prop.model)];
    scene.updateMatrixWorld(true);
    box.setFromObject(scene); box.getSize(size); box.getCenter(center);
    const s = prop.size / Math.max(size.x, size.z, 0.001);
    const sy = prop.h ? prop.h / Math.max(size.y, 0.001) : s;
    const key = zoneOf(prop.pos[0], prop.pos[1]);
    if (!zones.has(key)) zones.set(key, { solid: new Batch(), shadow: new Batch(true) });
    const zone = zones.get(key)!;
    // Centre the model on its footprint, stand it on the floor (or the table at prop.y), scale and turn it.
    const place = new THREE.Matrix4().compose(new THREE.Vector3(prop.pos[0], prop.y ?? 0, prop.pos[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, prop.rot, 0)), new THREE.Vector3(s, sy, s))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const color = (m.material as THREE.MeshBasicMaterial).color ?? white;
      zone.solid.addMatrix('matte', m.geometry, color, place.clone().multiply(m.matrixWorld));
    });
    // Floor-standing pieces get a soft contact shadow (not rugs, nor things standing on a table).
    if (prop.y === undefined && !prop.model.startsWith('rug')) {
      zone.shadow.add('matte', SHADOW_PLANE, '#ffffff', [prop.pos[0], 0.009, prop.pos[1]], [0, prop.rot, 0], [size.x * s * 1.25 + 0.15, 1, size.z * s * 1.25 + 0.15]);
    }
  }
  return [...zones].map(([key, z]) => ({ key, solid: z.solid.build().matte, shadow: z.shadow.build().matte }));
}

export function Furniture() {
  const gltfs = useGLTF(URLS);
  const zones = useMemo(() => bake(gltfs.map((g) => g.scene)), [gltfs]);
  useEffect(() => () => zones.forEach((z) => { z.solid?.dispose(); z.shadow?.dispose(); }), [zones]);
  return (
    <group>
      {zones.map((z) => (
        <group key={z.key}>
          {z.solid && <mesh geometry={z.solid} material={batchMaterials.matte} />}
          {z.shadow && <mesh geometry={z.shadow} material={shadowMaterial()} renderOrder={1} />}
        </group>
      ))}
    </group>
  );
}
