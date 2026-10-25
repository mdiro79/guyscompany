'use client';
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { props, type Prop } from './layout';
import { GroundShadow } from './GroundShadow';

// Kenney models ship with unlit materials; convert them to lit ones so the warm lighting applies.
// One material per colour is shared by every prop (the office has ~100 meshes but only a few colours).
const litMaterials = new Map<string, THREE.MeshStandardMaterial>();
function litMaterial(color: THREE.Color) {
  const key = color.getHexString();
  let m = litMaterials.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: color.clone(), roughness: 0.5, metalness: 0.02 }); litMaterials.set(key, m); }
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
  const { object, scale, offset, footprint } = useMemo(() => {
    const object = gltf.scene.clone(true);
    prepare(object);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const s = prop.size / Math.max(size.x, size.z, 0.001);
    const scale: [number, number, number] = [s, prop.h ? prop.h / Math.max(size.y, 0.001) : s, s];
    const center = box.getCenter(new THREE.Vector3());
    const footprint: [number, number] = [size.x * s, size.z * s];
    return { object, scale, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z), footprint };
  }, [gltf.scene, prop.size, prop.h]);
  // Floor-standing pieces get a soft contact shadow (not rugs, nor things standing on a table).
  const grounded = prop.y === undefined && !prop.model.startsWith('rug');
  return (
    <>
      {grounded && <GroundShadow pos={prop.pos} size={[footprint[0] * 1.25 + 0.15, footprint[1] * 1.25 + 0.15]} rotation={prop.rot} opacity={0.3} />}
      <group position={[prop.pos[0], prop.y ?? 0, prop.pos[1]]} rotation-y={prop.rot} scale={scale}>
        <primitive object={object} position={offset} />
      </group>
    </>
  );
}

export function Furniture() {
  const list = useMemo(() => props(), []);
  return <group>{list.map((p, i) => <Item key={i} prop={p} />)}</group>;
}

export const FURNITURE_MODELS = [...new Set(props().map((p) => p.model))];
FURNITURE_MODELS.forEach((m) => useGLTF.preload(`/models/furniture/${m}.glb`));
