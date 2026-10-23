'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, useProgress } from '@react-three/drei';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Message, Office, Profile } from '@/lib/data/types';
import { Building } from './Building';
import { Furniture } from './Furniture';
import { Player, type Pose } from './Player';
import { Avatars, type AvatarLabels } from './Avatars';
import { Receptionist } from './Receptionist';
import { FirstPersonArms } from './FirstPersonArms';
import { preloadCharacter } from '@/components/three/CharacterModel';
import { MonitorFrame } from './MonitorFrame';
import { TourBubbleAnchor } from './TourBubbleAnchor';
import { OFFICES, RECEPTION_Z, SPAWN } from './layout';
import type { RemoteAvatar } from './useOfficeNet';

export interface SceneProps {
  user: Profile; profiles: Profile[]; offices: Office[]; messages: Message[]; invitedSlots: number[];
  lowQuality: boolean; isPhone: boolean; receptionLabel: string; loadingLabel: string; avatarLabels: AvatarLabels;
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
          <pointLight position={[0, 2.6, 0]} intensity={18} distance={12} color="#ffd8a0" />
          <pointLight position={[0, 2.6, RECEPTION_Z]} intensity={10} distance={9} color="#ffd8a0" />
          <pointLight position={[-11, 2.6, 0]} intensity={8} distance={9} color="#ffd8a0" />
          <pointLight position={[11, 2.6, 0]} intensity={8} distance={9} color="#ffd8a0" />
          {OFFICES.map((o) => (
            <pointLight key={o.slot} position={[(o.min[0] + o.max[0]) / 2, 2.6, (o.min[1] + o.max[1]) / 2]} intensity={12} distance={9} color={o.wallColor === 'orange' ? '#ffc58a' : '#ffe0b8'} />
          ))}
        </>
      )}
    </>
  );
}

// Rendered inside the Suspense boundary after the models, so it mounts only once all of them are ready.
function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

// Real download progress of the office models (three.js loading manager), over the canvas until ready.
function LoadingOverlay({ label, ready }: { label: string; ready: boolean }) {
  const { progress } = useProgress();
  const [shown, setShown] = useState(0);
  const [gone, setGone] = useState(false);
  // Items are discovered while loading, so the raw value can step back; the bar only moves forward.
  useEffect(() => { setShown((s) => Math.max(s, ready ? 100 : Math.min(progress, 99))); }, [progress, ready]);
  useEffect(() => { if (!ready) return; const id = setTimeout(() => setGone(true), 400); return () => clearTimeout(id); }, [ready]);
  if (gone) return null;
  return (
    <div className={`pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-[#2a221c] transition-opacity duration-300 ${ready ? 'opacity-0' : 'opacity-100'}`}>
      <div className="w-[min(20rem,80vw)]"><ProgressBar percent={shown} label={label} dark /></div>
    </div>
  );
}

// Pixels rendered per CSS pixel. Phone screens have 3, so rendering at 1 looked blurry and jagged;
// low quality now means fewer lights and at most 1.5, high quality up to 2. If the frame rate drops,
// the scale steps down towards 1 (and back up when there is headroom again).
const MAX_DPR = { low: 1.5, high: 2 };
// Sharper only gives way when movement is really choppy (drei's default already steps down below 50 fps).
const FPS_BOUNDS = (): [number, number] => [30, 55];
function useRenderScale(low: boolean) {
  const max = Math.max(1, Math.min(window.devicePixelRatio || 1, low ? MAX_DPR.low : MAX_DPR.high));
  const [share, setShare] = useState(1);
  return {
    dpr: 1 + (max - 1) * share,
    decline: () => setShare((x) => Math.max(0, x - 0.34)),
    incline: () => setShare((x) => Math.min(1, x + 0.34)),
  };
}

export default function OfficeScene(p: SceneProps) {
  const [ready, setReady] = useState(false);
  const scale = useRenderScale(p.lowQuality);
  const markReady = useCallback(() => setReady(true), []);
  // Teammates' characters download after the office itself, so they don't hold up the first view.
  useEffect(() => { if (ready) new Set(p.profiles.map((x) => x.characterId)).forEach(preloadCharacter); }, [ready, p.profiles]);
  return (
    <>
    <LoadingOverlay label={p.loadingLabel} ready={ready} />
    <Canvas
      dpr={scale.dpr}
      // Fixed when the canvas is created, so it cannot follow the quality toggle; edges stay smooth on phones too.
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: p.isPhone ? 72 : 68, near: 0.05, far: 90, position: [SPAWN.pos[0], 1.6, SPAWN.pos[1]] }}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor bounds={FPS_BOUNDS} onDecline={scale.decline} onIncline={scale.incline} flipflops={4} />
      <color attach="background" args={['#2a221c']} />
      <fog attach="fog" args={['#2a221c', 24, 55]} />
      <Lights low={p.lowQuality} />
      <Suspense fallback={null}>
        <Building offices={p.offices} viewerId={p.user.id} invitedSlots={p.invitedSlots} />
        <Furniture />
        <Receptionist label={p.receptionLabel} />
        <Avatars remotes={p.remotes} profiles={p.profiles} messages={p.messages} labels={p.avatarLabels} voiceDistance={p.voiceDistance} />
        <FirstPersonArms characterId={p.user.characterId} userId={p.user.id} />
        <SceneReady onReady={markReady} />
      </Suspense>
      <Player offices={p.offices} viewerId={p.user.id} invitedSlots={p.invitedSlots} onPose={p.onPose} external={p.external} remotes={p.remotes} isPhone={p.isPhone} />
      <MonitorFrame />
      <TourBubbleAnchor />
    </Canvas>
    </>
  );
}
