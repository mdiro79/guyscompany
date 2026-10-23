'use client';
import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Message, Office, Profile } from '@/lib/data/types';
import { Building } from './Building';
import { Furniture } from './Furniture';
import { Player, type Pose } from './Player';
import { Avatars, Receptionist } from './Avatars';
import { FirstPersonArms } from './FirstPersonArms';
import { preloadCharacter } from '@/components/three/CharacterModel';
import { MonitorFrame } from './MonitorFrame';
import { OFFICES } from './layout';
import type { RemoteAvatar } from './useOfficeNet';

export interface SceneProps {
  user: Profile; profiles: Profile[]; offices: Office[]; messages: Message[]; invitedSlots: number[];
  lowQuality: boolean; isPhone: boolean; receptionLabel: string;
  remotes: React.RefObject<Map<string, RemoteAvatar>>; external: React.RefObject<Pose | null>;
  onPose: (p: Pose) => void; voiceDistance: (pos: [number, number], userId: string) => void;
}

function Lights({ low }: { low: boolean }) {
  return (
    <>
      <hemisphereLight args={['#fff3df', '#8a6a4a', low ? 2.4 : 1.7]} />
      <ambientLight intensity={0.25} color="#ffd9a8" />
      {!low && (
        <>
          <pointLight position={[0, 2.6, 0]} intensity={14} distance={10} color="#ffd8a0" />
          <pointLight position={[0, 2.6, 8.5]} intensity={10} distance={9} color="#ffd8a0" />
          {OFFICES.map((o) => (
            <pointLight key={o.slot} position={[(o.min[0] + o.max[0]) / 2, 2.6, (o.min[1] + o.max[1]) / 2]} intensity={12} distance={9} color={o.wallColor === 'orange' ? '#ffc58a' : '#ffe0b8'} />
          ))}
        </>
      )}
    </>
  );
}

export default function OfficeScene(p: SceneProps) {
  // Teammates' characters download in the background, so they appear as soon as someone walks in.
  useEffect(() => { new Set(p.profiles.map((x) => x.characterId)).forEach(preloadCharacter); }, [p.profiles]);
  return (
    <Canvas
      dpr={p.lowQuality ? 1 : [1, 1.75]}
      gl={{ antialias: !p.lowQuality, powerPreference: p.lowQuality ? 'low-power' : 'high-performance' }}
      camera={{ fov: p.isPhone ? 72 : 68, near: 0.05, far: 80, position: [0, 1.6, 11.6] }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#2a221c']} />
      <fog attach="fog" args={['#2a221c', 18, 40]} />
      <Lights low={p.lowQuality} />
      <Suspense fallback={null}>
        <Building offices={p.offices} viewerId={p.user.id} invitedSlots={p.invitedSlots} />
        <Furniture />
        <Receptionist label={p.receptionLabel} />
        <Avatars remotes={p.remotes} profiles={p.profiles} messages={p.messages} voiceDistance={p.voiceDistance} />
        <FirstPersonArms characterId={p.user.characterId} userId={p.user.id} />
      </Suspense>
      <Player offices={p.offices} viewerId={p.user.id} invitedSlots={p.invitedSlots} onPose={p.onPose} external={p.external} isPhone={p.isPhone} />
      <MonitorFrame />
    </Canvas>
  );
}
