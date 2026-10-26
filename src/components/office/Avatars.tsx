'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Profile } from '@/lib/data/types';
import { CharacterModel, type HeadListener, type Motion } from '@/components/three/CharacterModel';
import { getCharacter, isFlying } from '@/lib/characters';
import { useVoice } from '@/components/voice/VoiceContext';
import { allSeats } from './layout';
import type { RemoteAvatar } from './useOfficeNet';
import { GroundShadow } from './GroundShadow';
import { anchors, presentPeople } from './labels';

const SEATS = allSeats();

// A teammate's character. Its name, speech bubble and emote are drawn by the page (OfficeLabels) at
// the head this registers (labels.ts).
function RemoteCharacter({ remotes, profile }: { remotes: React.RefObject<Map<string, RemoteAvatar>>; profile: Profile }) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Group>(null); // stays on the floor under flying characters too
  const voice = useVoice();
  const [motion, setMotion] = useState<Motion>('idle');
  const [talk, setTalk] = useState(0);
  const character = getCharacter(profile.characterId);
  useFrame((_, dt) => {
    const g = group.current;
    const avatar = remotes.current.get(profile.id);
    if (!g || !avatar) return;
    const p = avatar.pose;
    const seat = p.seatId ? SEATS.find((s) => s.id === p.seatId) : null;
    const tx = seat ? seat.pos[0] : p.x, tz = seat ? seat.pos[1] : p.z;
    const yaw = (seat ? seat.facing : p.yaw) + Math.PI;
    const k = 1 - Math.exp(-dt * 10);
    g.position.x += (tx - g.position.x) * k;
    g.position.z += (tz - g.position.z) * k;
    g.position.y = isFlying(character) ? 0.35 + Math.sin(performance.now() / 400) * 0.06 + (seat ? 0.2 : 0) : seat ? -0.05 : 0;
    let d = yaw - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * k;
    shadow.current?.position.set(g.position.x, 0, g.position.z);
    const m: Motion = seat ? 'sit' : p.moving === 2 ? 'run' : p.moving ? 'walk' : 'idle';
    if (m !== motion) setMotion(m);
    const level = voice.getLevel(profile.id);
    const anchor = anchors.get(profile.id);
    if (anchor) anchor.talk = level;
    const lvl = Math.round(level * 10) / 10;
    if (lvl !== talk) setTalk(lvl);
  });
  // The model reports its head before this component's effects run (children first), so it is kept here too.
  const head = useRef<{ head: THREE.Object3D | null; top: number }>({ head: null, top: 0 });
  const onHead = useCallback<HeadListener>((bone, top) => {
    head.current = { head: bone, top };
    const a = anchors.get(profile.id);
    if (a) Object.assign(a, head.current);
  }, [profile.id]);
  useEffect(() => {
    const a = remotes.current.get(profile.id);
    if (group.current && a) group.current.position.set(a.pose.x, 0, a.pose.z);
    if (group.current) anchors.set(profile.id, { root: group.current, ...head.current, talk: 0, hidden: false });
    return () => { anchors.delete(profile.id); };
  }, [remotes, profile.id]);
  return (
    <>
    <group ref={shadow}><GroundShadow size={[0.75, 0.75]} opacity={0.35} /></group>
    <group ref={group}>
      <Suspense fallback={null}><CharacterModel characterId={profile.characterId} motion={motion} talkLevel={talk} onHead={onHead} /></Suspense>
    </group>
    </>
  );
}

export function Avatars({ remotes, profiles, voiceDistance }: {
  remotes: React.RefObject<Map<string, RemoteAvatar>>; profiles: Profile[];
  voiceDistance: (pos: [number, number], userId: string) => void;
}) {
  const [visible, setVisible] = useState<string[]>([]);
  useFrame(() => {
    const now = performance.now();
    const ids = [...remotes.current.values()].filter((r) => now - r.receivedAt < 5000).map((r) => r.userId).sort();
    if (ids.join() !== visible.join()) setVisible(ids);
    for (const r of remotes.current.values()) voiceDistance([r.pose.x, r.pose.z], r.userId);
  });
  const shown = visible.filter((id) => profiles.some((p) => p.id === id));
  useEffect(() => { presentPeople.set(shown); });
  useEffect(() => () => presentPeople.set([]), []);
  return (
    <>
      {shown.map((id) => <RemoteCharacter key={id} remotes={remotes} profile={profiles.find((p) => p.id === id)!} />)}
    </>
  );
}
