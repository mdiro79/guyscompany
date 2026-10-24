'use client';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor, useProgress } from '@react-three/drei';
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
import { ConferenceRoom } from './ConferenceRoom';
import { ENV_INTENSITY, HEMI_NAME, hemiIntensity } from './lighting';
import type { MeetingLabels } from './textures';
import { OFFICES, RECEPTION_Z, SPAWN, WALL_HEIGHT } from './layout';
import type { RemoteAvatar } from './useOfficeNet';
import { officeUi } from './store';

export interface SceneProps {
  user: Profile; profiles: Profile[]; offices: Office[]; messages: Message[]; invitedSlots: number[];
  lowQuality: boolean; isPhone: boolean; receptionLabel: string; loadingLabel: string; avatarLabels: AvatarLabels; meetingLabels: MeetingLabels;
  remotes: React.RefObject<Map<string, RemoteAvatar>>; external: React.RefObject<Pose | null>;
  onPose: (p: Pose) => void; voiceDistance: (pos: [number, number], userId: string) => void;
}

// Ambient occlusion, glow and vignette for high quality; a separate chunk loaded only when used.
const Effects = lazy(() => import('./Effects'));

// Soft image-based light built from a few glowing panels (no download): a warm ceiling, light walls and a
// darker floor, so surfaces get gentle shading and reflections instead of flat colour.
function SoftEnvironment() {
  return (
    <Environment resolution={64} frames={1} environmentIntensity={ENV_INTENSITY}>
      <color attach="background" args={['#b9a58c']} />
      <Lightformer form="rect" intensity={2.4} color="#fff1dc" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
      <Lightformer form="rect" intensity={0.9} color="#f6dcc0" position={[0, 2, -20]} scale={[40, 4, 1]} />
      <Lightformer form="rect" intensity={0.9} color="#f6dcc0" position={[0, 2, 20]} rotation-y={Math.PI} scale={[40, 4, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#e9d2b8" position={[-20, 2, 0]} rotation-y={Math.PI / 2} scale={[40, 4, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#e9d2b8" position={[20, 2, 0]} rotation-y={-Math.PI / 2} scale={[40, 4, 1]} />
    </Environment>
  );
}

// A ceiling downlight: a wide soft cone pointing at the floor. Unlike the point lights it replaces,
// it does not burn a bright spot into the ceiling right above it.
function Downlight({ pos, intensity, color }: { pos: [number, number]; intensity: number; color: string }) {
  const ref = useRef<THREE.SpotLight>(null);
  useLayoutEffect(() => {
    const l = ref.current;
    if (!l) return;
    l.target.position.set(pos[0], 0, pos[1]);
    l.target.updateMatrixWorld();
  }, [pos]);
  return <spotLight ref={ref} position={[pos[0], WALL_HEIGHT - 0.05, pos[1]]} angle={1.2} penumbra={1} intensity={intensity} distance={11} decay={2} color={color} />;
}

const DOWNLIGHTS: { pos: [number, number]; intensity: number; color: string }[] = [
  { pos: [0, RECEPTION_Z], intensity: 22, color: '#ffe2bd' },
  { pos: [-11, 0], intensity: 18, color: '#ffe2bd' },
  { pos: [11, 0], intensity: 18, color: '#ffe2bd' },
  ...OFFICES.map((o) => ({ pos: [(o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2] as [number, number], intensity: 24, color: o.wallColor === 'orange' ? '#ffd2a3' : '#ffe8cc' })),
];

function Lights({ low }: { low: boolean }) {
  return (
    <>
      <hemisphereLight name={HEMI_NAME} args={['#fff6ea', '#8f7760', hemiIntensity(low)]} />
      <ambientLight intensity={0.1} color="#ffe6c4" />
      {!low && DOWNLIGHTS.map((d) => <Downlight key={d.pos.join()} {...d} />)}
      {/* Low quality: one soft key light from above instead of the downlights, so shapes still read. */}
      {low && <directionalLight position={[4, 9, 6]} intensity={1.1} color="#fff0dc" />}
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
  const shareRef = useRef(share);
  shareRef.current = share;
  return {
    dpr: 1 + (max - 1) * share,
    decline: () => {
      // Still too slow at the lowest scale: drop the effects and extra lights (the gauge button brings them back).
      if (shareRef.current === 0 && !low) officeUi.set({ lowQuality: true });
      setShare((x) => Math.max(0, x - 0.34));
    },
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
      <color attach="background" args={['#e4dbcf']} />
      <fog attach="fog" args={['#e4dbcf', 30, 64]} />
      <Lights low={p.lowQuality} />
      <SoftEnvironment />
      <ConferenceRoom labels={p.meetingLabels} lowQuality={p.lowQuality} />
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
      {!p.lowQuality && ready && <Suspense fallback={null}><Effects phone={p.isPhone} /></Suspense>}
    </Canvas>
    </>
  );
}
