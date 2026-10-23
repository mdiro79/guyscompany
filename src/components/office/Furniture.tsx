'use client';
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { props, type Prop } from './layout';

// Kenney models ship with unlit materials; convert them to lit ones so the warm lighting applies.
// One material per colour is shared by every prop (the office has ~100 meshes but only a few colours).
const litMaterials = new Map<string, THREE.MeshStandardMaterial>();
function litMaterial(color: THREE.Color) {
  const key = color.getHexString();
  let m = litMaterials.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.75, metalness: 0.05 }); litMaterials.set(key, m); }
  return m;
}

function prepare(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshBasicMaterial;
    m.material = litMaterial(src.color ?? new THREE.Color('#ccc'));
  });
}

function Item({ prop }: { prop: Prop }) {
  const gltf = useGLTF(`/models/furniture/${prop.model}.glb`);
  const { object, scale, offset } = useMemo(() => {
    const object = gltf.scene.clone(true);
    prepare(object);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const scale = prop.size / Math.max(size.x, size.z, 0.001);
    const center = box.getCenter(new THREE.Vector3());
    return { object, scale, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) };
  }, [gltf.scene, prop.size]);
  return (
    <group position={[prop.pos[0], prop.y ?? 0, prop.pos[1]]} rotation-y={prop.rot} scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

export function Furniture() {
  const list = useMemo(() => props(), []);
  return <group>{list.map((p, i) => <Item key={i} prop={p} />)}</group>;
}

export const FURNITURE_MODELS = [...new Set(props().map((p) => p.model))];
FURNITURE_MODELS.forEach((m) => useGLTF.preload(`/models/furniture/${m}.glb`));
