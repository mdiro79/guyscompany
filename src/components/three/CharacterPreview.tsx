'use client';
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { CharacterModel } from './CharacterModel';

function Spinner({ id }: { id: string }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.6; });
  return <group ref={g}><CharacterModel characterId={id} /></group>;
}

// Rotating 3D preview used by the character picker.
export default function CharacterPreview({ characterId }: { characterId: string }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.05, 4.3], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0.78, 0)}>
      <hemisphereLight args={['#fff6e8', '#7a5a3a', 2.2]} />
      <directionalLight position={[2, 4, 3]} intensity={2} color="#ffe2b8" />
      <Suspense fallback={null}><Spinner id={characterId} /></Suspense>
      <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[0.9, 48]} /><meshStandardMaterial color="#e9dfcf" /></mesh>
    </Canvas>
  );
}
