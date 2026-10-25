'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getCharacter, KAYKIT_ANIMATIONS, type Character } from '@/lib/characters';

export type Motion = 'idle' | 'walk' | 'run' | 'sit';

const CLIPS: Record<Character['group'], Record<Exclude<Motion, 'sit'>, string[]>> = {
  humans: { idle: ['Idle'], walk: ['Walk'], run: ['Run'] },
  'monsters-a': { idle: ['Idle'], walk: ['Walk'], run: ['Run'] },
  'monsters-b': { idle: ['Idle'], walk: ['Walk'], run: ['Walk'] },
  'monsters-c': { idle: ['Flying_Idle'], walk: ['Fast_Flying', 'Flying_Idle'], run: ['Fast_Flying'] },
  kaykit: { idle: ['Idle_A'], walk: ['Walking_A'], run: ['Running_A'] },
};

export const CHARACTER_HEIGHT = 1.55;
const TYPE_ARM = -1.3, TYPE_FORE = -0.25;

const findBone = (root: THREE.Object3D, re: RegExp, not?: RegExp) => {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => { if (!found && (o as THREE.Bone).isBone && re.test(o.name) && !(not && not.test(o.name))) found = o; });
  return found as THREE.Object3D | null;
};

interface CharacterProps { characterId: string; motion?: Motion; talkLevel?: number; hideHead?: boolean; onlyArms?: boolean; typing?: boolean }

/**
 * One of the 20 characters, normalised to CHARACTER_HEIGHT with feet at y=0.
 * talkLevel (0..1) nods the head and swings the arms, since none of the models has a mouth.
 */
export function CharacterModel(props: CharacterProps) {
  // Only KayKit characters need the shared animation files (~770 KB); the others carry their own clips.
  return getCharacter(props.characterId).group === 'kaykit' ? <KaykitCharacter {...props} /> : <Rig {...props} />;
}

function KaykitCharacter(props: CharacterProps) {
  // Start all three downloads at once; otherwise each suspending hook would wait for the previous file.
  preloadCharacter(props.characterId);
  const general = useGLTF(KAYKIT_ANIMATIONS[0]);
  const movement = useGLTF(KAYKIT_ANIMATIONS[1]);
  const clips = useMemo(() => [...general.animations, ...movement.animations], [general.animations, movement.animations]);
  return <Rig {...props} sharedClips={clips} />;
}

function Rig({ characterId, motion = 'idle', talkLevel = 0, hideHead = false, onlyArms = false, typing = false, sharedClips }: CharacterProps & { sharedClips?: THREE.AnimationClip[] }) {
  const character = getCharacter(characterId);
  const gltf = useGLTF(character.model);
  const talk = useRef(0);

  const { object, scale, offsetY, bones } = useMemo(() => {
    const object = cloneSkinned(gltf.scene) as THREE.Object3D;
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
    });
    const box = new THREE.Box3().setFromObject(object);
    const height = box.max.y - box.min.y || 1;
    const scale = CHARACTER_HEIGHT / height;
    return {
      object, scale, offsetY: -box.min.y * scale,
      bones: {
        head: findBone(object, /head/i, /end|top/i),
        neck: findBone(object, /neck/i),
        armL: findBone(object, /(upperarm|arm).*(l|left)\b|(l|left).*upperarm|shoulder\.?l|ArmLeft|upperarm_l/i),
        armR: findBone(object, /(upperarm|arm).*(r|right)\b|(r|right).*upperarm|shoulder\.?r|ArmRight|upperarm_r/i),
        legL: findBone(object, /upperleg\.?l|thigh.*l|LegLeft|upperleg_l/i),
        legR: findBone(object, /upperleg\.?r|thigh.*r|LegRight|upperleg_r/i),
        shinL: findBone(object, /lowerleg\.?l|shin.*l|lowerleg_l/i),
        shinR: findBone(object, /lowerleg\.?r|shin.*r|lowerleg_r/i),
        foreL: findBone(object, /lowerarm\.?l\b|forearm.*l\b|lowerarm_l/i),
        foreR: findBone(object, /lowerarm\.?r\b|forearm.*r\b|lowerarm_r/i),
      },
    };
  }, [gltf.scene]);

  const clips = sharedClips ?? gltf.animations;
  const mixer = useMemo(() => new THREE.AnimationMixer(object), [object]);
  const current = useRef<THREE.AnimationAction | null>(null);
  const hasSitClip = clips.some((c) => c.name === 'SitDown');

  useEffect(() => {
    const pick = (names: string[]) => names.map((n) => clips.find((c) => c.name === n)).find(Boolean) ?? clips[0];
    let action: THREE.AnimationAction | null = null;
    if (motion === 'sit' && hasSitClip) {
      action = mixer.clipAction(clips.find((c) => c.name === 'SitDown')!);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      const clip = pick(CLIPS[character.group][motion === 'sit' ? 'idle' : motion]);
      action = clip ? mixer.clipAction(clip) : null;
      action?.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    if (current.current && current.current !== action) current.current.fadeOut(0.2);
    current.current = action;
  }, [motion, clips, mixer, character.group, hasSitClip]);

  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  useEffect(() => {
    if (bones.head) bones.head.scale.setScalar(hideHead ? 0.001 : 1);
  }, [hideHead, bones.head]);

  useEffect(() => {
    if (!onlyArms) return;
    // First-person: hide everything except the arm chain.
    object.traverse((o) => { if ((o as THREE.Mesh).isMesh && /head|leg|body|cape|helmet|hat|hood/i.test(o.name) && !/arm/i.test(o.name)) o.visible = false; });
  }, [onlyArms, object]);

  // Talking offsets are additive; the previous frame's offset is removed first so un-animated bones do not drift.
  const applied = useRef({ hx: 0, hz: 0, al: 0, ar: 0, tl: 0, tr: 0, fl: 0, fr: 0 });
  useFrame((state, dt) => {
    const a = applied.current;
    if (bones.head) { bones.head.rotation.x -= a.hx; bones.head.rotation.z -= a.hz; }
    if (bones.armL) bones.armL.rotation.z -= a.al;
    if (bones.armR) bones.armR.rotation.z -= a.ar;
    if (bones.armL) bones.armL.rotation.x -= a.tl;
    if (bones.armR) bones.armR.rotation.x -= a.tr;
    if (bones.foreL) bones.foreL.rotation.x -= a.fl;
    if (bones.foreR) bones.foreR.rotation.x -= a.fr;
    mixer.update(Math.min(dt, 0.1));
    talk.current += (talkLevel - talk.current) * Math.min(1, dt * 12);
    const k = talk.current;
    const time = state.clock.elapsedTime;
    a.hx = Math.sin(time * 9) * 0.12 * k;
    a.hz = Math.sin(time * 5.3) * 0.06 * k;
    a.al = Math.sin(time * 6) * 0.25 * k;
    a.ar = -Math.sin(time * 6 + 1.3) * 0.25 * k;
    if (bones.head) { bones.head.rotation.x += a.hx; bones.head.rotation.z += a.hz; }
    if (bones.armL) bones.armL.rotation.z += a.al;
    if (bones.armR) bones.armR.rotation.z += a.ar;
    // Typing at a keyboard: forearms forward with small alternating taps.
    const ty = typing ? 1 : 0;
    a.tl = ty * (TYPE_ARM + Math.sin(time * 17) * 0.05);
    a.tr = ty * (TYPE_ARM + Math.sin(time * 15 + 1.7) * 0.05);
    a.fl = ty * TYPE_FORE; a.fr = ty * TYPE_FORE;
    if (bones.armL) bones.armL.rotation.x += a.tl;
    if (bones.armR) bones.armR.rotation.x += a.tr;
    if (bones.foreL) bones.foreL.rotation.x += a.fl;
    if (bones.foreR) bones.foreR.rotation.x += a.fr;
    // Procedural sitting pose for characters without a sit animation; flyers just hover.
    if (motion === 'sit' && !hasSitClip && character.group !== 'monsters-c') {
      for (const leg of [bones.legL, bones.legR]) if (leg) leg.rotation.x = -Math.PI / 2;
      for (const shin of [bones.shinL, bones.shinR]) if (shin) shin.rotation.x = Math.PI / 2;
    }
  });

  return (
    <group scale={scale} position-y={offsetY}>
      <primitive object={object} />
    </group>
  );
}

export function preloadCharacter(id: string) {
  const c = getCharacter(id);
  useGLTF.preload(c.model);
  if (c.group === 'kaykit') KAYKIT_ANIMATIONS.forEach((a) => useGLTF.preload(a));
}
