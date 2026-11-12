'use client';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, addAfterEffect, useThree } from '@react-three/fiber';
import { Environment, Lightformer, useProgress } from '@react-three/drei';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Office, Profile } from '@/lib/data/types';
import { Building } from './Building';
import { Furniture } from './Furniture';
import { Player, type Pose } from './Player';
import { Avatars } from './Avatars';
import { LabelProjector } from './LabelProjector';
import { Receptionist } from './Receptionist';
import { FirstPersonArms } from './FirstPersonArms';
import { preloadCharacter } from '@/components/three/CharacterModel';
import { MonitorFrame } from './MonitorFrame';
import { TourBubbleAnchor } from './TourBubbleAnchor';
import { ConferenceRoom } from './ConferenceRoom';
import { Rooms, type RoomLabels } from './rooms/Rooms';
import { ENV_INTENSITY, HEMI_NAME, hemiIntensity } from './lighting';
import { LightPool } from './LightPool';
import type { MeetingLabels } from './textures';
import { SPAWN } from './layout';
import type { RemoteAvatar } from './useOfficeNet';
import { input } from './store';
import { SceneStats } from './SceneStats';
import { COMPUTER, LADDER, LOWEST, PHONE, WINDOW_MS, dprOf, initialQuality, stepQuality } from './quality';

export interface SceneProps {
  user: Profile; profiles: Profile[]; offices: Office[]; invitedSlots: number[];
  lowQuality: boolean; isPhone: boolean; loadingLabel: string; meetingLabels: MeetingLabels; roomLabels: RoomLabels;
  paused: boolean; // nothing of the 3D view is visible (a full-screen panel covers it): stop drawing
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

function Lights({ low }: { low: boolean }) {
  return (
    <>
      <hemisphereLight name={HEMI_NAME} args={['#fff6ea', '#8f7760', hemiIntensity(low)]} />
      <ambientLight intensity={0.1} color="#ffe6c4" />
      {!low && <LightPool />}
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

// Graphics quality follows the device (see quality.ts): it steps down gently when frames come late or the
// device has been working for a while, and back up when there is headroom. Kept between visits to the
// office, so coming back from the dashboard does not start a warm phone at full quality again.
let quality = initialQuality();
let lastWindow = 0;
let frames = 0;
const IDLE_MS = 8000; // no touch, key or mouse for this long: the view is drawn at 30 frames a second

// Nobody is touching, typing or moving: a still view does not need 60 frames a second.
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined, isIdle = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(function check() {
        // A joystick held still sends no events, but the player is walking.
        if (input.forward || input.right) { timer = setTimeout(check, 1000); return; }
        isIdle = true; setIdle(true);
      }, IDLE_MS);
    };
    const wake = () => { if (isIdle) { isIdle = false; setIdle(false); } arm(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true, capture: true }));
    arm();
    return () => { clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, wake, { capture: true })); };
  }, []);
  return idle;
}

function useAdaptiveQuality(manualLow: boolean, phone: boolean, paused: boolean, ready: boolean) {
  const tune = phone ? PHONE : COMPUTER;
  const [level, setLevel] = useState(() => quality.level);
  const idle = useIdle();
  const step = LADDER[manualLow ? LOWEST : level];
  const fps = idle ? 30 : step.fps;
  const live = useRef({ paused, ready, fps, fpsSince: 0 });
  if (live.current.fps !== fps) live.current.fpsSince = performance.now();
  Object.assign(live.current, { paused, ready, fps });
  // Turning high quality back on (the gauge button) starts again from the best step.
  const wasLow = useRef(manualLow);
  useEffect(() => {
    if (wasLow.current && !manualLow) { quality = initialQuality(); setLevel(0); }
    wasLow.current = manualLow;
  }, [manualLow]);
  useEffect(() => {
    if (manualLow) return;
    // Time away from the office cooled the device down.
    const now = performance.now();
    if (lastWindow) quality = stepQuality(quality, { now, dt: now - lastWindow, running: false, ratio: null }, tune);
    lastWindow = now; frames = 0;
    setLevel(quality.level);
    const id = setInterval(() => {
      const t = performance.now(), dt = t - lastWindow, l = live.current;
      const running = !l.paused && l.ready && document.visibilityState === 'visible';
      const judged = running && t - quality.changedAt > 2500 && t - l.fpsSince > dt;
      const ratio = judged ? frames / (l.fps * dt / 1000) : null;
      quality = stepQuality(quality, { now: t, dt, running, ratio }, tune);
      lastWindow = t; frames = 0;
      // For the measuring scripts and the debug badge, like window.__gcStats.
      (window as unknown as { __gcQuality?: unknown }).__gcQuality = { ...quality, ratio, fps: l.fps };
      setLevel(quality.level);
    }, WINDOW_MS);
    return () => clearInterval(id);
  }, [manualLow, tune]);
  const max = Math.min(window.devicePixelRatio || 1, 2);
  return { step, fps, dpr: dprOf(step, max) };
}

// Draws the view at a steady rate (60 or 30 frames a second, also on 90 and 120 Hz screens) and counts
// the frames actually drawn, which is how the quality controller knows whether the device keeps up.
function FrameDriver({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const step = 1000 / fps;
    let raf = 0, next = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t + 2 < next) return;
      next = t - next > step ? t + step : next + step;
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    const off = addAfterEffect(() => { frames++; });
    return () => { cancelAnimationFrame(raf); off(); };
  }, [fps, invalidate]);
  return null;
}

export default function OfficeScene(p: SceneProps) {
  const [ready, setReady] = useState(false);
  const q = useAdaptiveQuality(p.lowQuality, p.isPhone, p.paused, ready);
  const markReady = useCallback(() => setReady(true), []);
  // Names for the conference screen (who presents, who wrote what, raised hands).
  const people = useMemo(() => p.profiles.map((x) => ({ id: x.id, name: x.displayName })), [p.profiles]);
  // Teammates' characters download after the office itself, so they don't hold up the first view.
  useEffect(() => { if (ready) new Set(p.profiles.map((x) => x.characterId)).forEach(preloadCharacter); }, [ready, p.profiles]);
  return (
    <>
    <LoadingOverlay label={p.loadingLabel} ready={ready} />
    <Canvas
      dpr={q.dpr}
      // Frames are requested by FrameDriver at the chosen rate; none at all while paused (only on demand).
      frameloop="demand"
      // Fixed when the canvas is created, so it cannot follow the quality toggle; edges stay smooth on phones too.
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // The same tone mapping as the effects pass, so colours do not jump when the effects turn off.
      onCreated={({ gl }) => { gl.toneMapping = THREE.NeutralToneMapping; }}
      camera={{ fov: p.isPhone ? 72 : 68, near: 0.05, far: 120, position: [SPAWN.pos[0], 1.6, SPAWN.pos[1]] }}
      style={{ touchAction: 'none' }}
    >
      {!p.paused && <FrameDriver fps={q.fps} />}
      <color attach="background" args={['#e4dbcf']} />
      <fog attach="fog" args={['#e4dbcf', 30, 64]} />
      <Lights low={q.step.simpleLights} />
      <SoftEnvironment />
      <ConferenceRoom labels={p.meetingLabels} people={people} lowQuality={q.step.simpleLights} />
      <Rooms labels={p.roomLabels} people={people} />
      <Suspense fallback={null}>
        <Building offices={p.offices} />
        <Furniture />
        <Receptionist />
        <Avatars remotes={p.remotes} profiles={p.profiles} voiceDistance={p.voiceDistance} />
        <FirstPersonArms characterId={p.user.characterId} userId={p.user.id} />
        <SceneReady onReady={markReady} />
      </Suspense>
      <Player offices={p.offices} viewerId={p.user.id} invitedSlots={p.invitedSlots} onPose={p.onPose} external={p.external} remotes={p.remotes} isPhone={p.isPhone} />
      <MonitorFrame />
      <TourBubbleAnchor />
      <LabelProjector offices={p.offices} />
      <SceneStats />
      {q.step.effects && ready && <Suspense fallback={null}><Effects phone={p.isPhone} ao={q.step.ao} glow={q.step.glow} msaa={q.step.msaa} /></Suspense>}
    </Canvas>
    </>
  );
}
