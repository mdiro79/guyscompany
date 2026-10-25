'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getCharacter } from '@/lib/characters';
import { useVoice } from '@/components/voice/VoiceContext';
import { input, useOfficeUi } from './store';

const FALLBACK = ['#d9a27a', '#7aa6c2', '#9fbf7a', '#c98fb6', '#e0b45a'];

// Picks skin/sleeve colours from the chosen character's materials.
function useArmColors(characterId: string) {
  const c = getCharacter(characterId);
  const gltf = useGLTF(c.model);
  return useMemo(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && !mats.includes(m)) mats.push(m);
    });
    const byName = (re: RegExp) => mats.find((m) => re.test(m.name) && !m.map)?.color;
    const skin = byName(/skin/i) ?? new THREE.Color(FALLBACK[0]);
    const sleeve = byName(/shirt|coat|jacket|body|cloth|top/i) ?? new THREE.Color(FALLBACK[(c.id.length + c.name.length) % FALLBACK.length]);
    return { skin: `#${skin.getHexString()}`, sleeve: `#${sleeve.getHexString()}` };
  }, [gltf.scene, c.id, c.name]);
}

// Stylised arms attached to the camera, coloured like the player's character.
export function FirstPersonArms({ characterId, userId }: { characterId: string; userId: string }) {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const { skin, sleeve } = useArmColors(characterId);
  const voice = useVoice();
  const seated = useOfficeUi((s) => s.seatId !== null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const moving = input.moving;
    t.current += dt * (moving ? 8 : 2);
    const talk = voice.getLevel(userId);
    const swing = Math.sin(t.current) * 0.04;
    if (left.current) { left.current.position.y = -0.46 + swing + Math.sin(t.current * 3) * 0.03 * talk; left.current.rotation.x = -1.25 + talk * 0.4; }
    if (right.current) { right.current.position.y = -0.46 - swing + Math.cos(t.current * 3) * 0.03 * talk; right.current.rotation.x = -1.25 + talk * 0.5; }
  });
  if (seated) return null;
  const arm = (side: number, r: React.RefObject<THREE.Group | null>) => (
    <group ref={r} position={[side * 0.3, -0.46, -0.42]} rotation={[-1.25, side * -0.15, side * 0.1]}>
      <mesh position-y={-0.12}><capsuleGeometry args={[0.04, 0.3, 6, 12]} /><meshStandardMaterial color={sleeve} /></mesh>
      <mesh position-y={0.12}><sphereGeometry args={[0.045, 14, 12]} /><meshStandardMaterial color={skin} /></mesh>
    </group>
  );
  // Called as functions, not <Arm />, so a re-render keeps the same meshes instead of rebuilding them.
  return (
    <group ref={group}>
      {arm(-1, left)}
      {arm(1, right)}
    </group>
  );
}
