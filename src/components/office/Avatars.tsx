'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Message, Profile } from '@/lib/data/types';
import { CharacterModel, CHARACTER_HEIGHT, type Motion } from '@/components/three/CharacterModel';
import { getCharacter, isFlying } from '@/lib/characters';
import { useVoice } from '@/components/voice/VoiceContext';
import { allSeats } from './layout';
import type { RemoteAvatar } from './useOfficeNet';
import { emoteEmoji } from './emotes';
import { officeUi, useOfficeUi } from './store';

const SEATS = allSeats();
const BUBBLE_MS = 15000;

function Bubble({ profile, messages, emote, onSelect }: { profile: Profile; messages: Message[]; emote: string | null; onSelect: () => void }) {
  const selected = useOfficeUi((s) => s.selectedUserId === profile.id);
  const [seen, setSeen] = useState(messages.length);
  const latest = messages.at(-1);
  const fresh = latest && Date.now() - new Date(latest.createdAt).getTime() < BUBBLE_MS;
  const unread = Math.max(0, messages.length - seen);
  useEffect(() => { if (selected) setSeen(messages.length); }, [selected, messages.length]);
  return (
    <div dir="ltr" className="pointer-events-auto flex w-max max-w-56 -translate-y-full flex-col items-center gap-1" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      {selected && (
        <div className="max-h-48 w-56 space-y-1 overflow-y-auto rounded-xl bg-white/95 p-2 text-xs text-[#1f2a24] shadow-lg">
          {messages.slice(-6).map((m) => <p key={m.id} dir="auto" className="rounded-lg bg-[#f4efe6] px-2 py-1">{m.body || '📎'}</p>)}
          {messages.length === 0 && <p className="text-center opacity-60">—</p>}
        </div>
      )}
      {!selected && (emote || fresh) && (
        <div className="max-w-52 rounded-2xl bg-white/95 px-3 py-1.5 text-center text-sm text-[#1f2a24] shadow-md" dir="auto">
          {emote ? <span className="text-2xl leading-none">{emote}</span> : <span className="line-clamp-2">{latest?.body}</span>}
        </div>
      )}
      <div data-avatar-label className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
        {profile.displayName}
        {unread > 0 && !selected && <span className="rounded-full bg-[#f07a2a] px-1.5 text-[10px]">{unread}</span>}
      </div>
    </div>
  );
}

function RemoteCharacter({ remotes, profile, messages }: { remotes: React.RefObject<Map<string, RemoteAvatar>>; profile: Profile; messages: Message[] }) {
  const group = useRef<THREE.Group>(null);
  const voice = useVoice();
  const [motion, setMotion] = useState<Motion>('idle');
  const [talk, setTalk] = useState(0);
  const [emote, setEmote] = useState<string | null>(null);
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
    const m: Motion = seat ? 'sit' : p.moving === 2 ? 'run' : p.moving ? 'walk' : 'idle';
    if (m !== motion) setMotion(m);
    const lvl = Math.round(voice.getLevel(profile.id) * 10) / 10;
    if (lvl !== talk) setTalk(lvl);
    const e = avatar.emote && avatar.emote.until > Date.now() ? emoteEmoji(avatar.emote.id) : null;
    if (e !== emote) setEmote(e);
  });
  useEffect(() => {
    const a = remotes.current.get(profile.id);
    if (group.current && a) group.current.position.set(a.pose.x, 0, a.pose.z);
  }, [remotes, profile.id]);
  return (
    <group ref={group}>
      <Suspense fallback={null}><CharacterModel characterId={profile.characterId} motion={motion} talkLevel={talk} /></Suspense>
      <Html position={[0, CHARACTER_HEIGHT + 0.12, 0]} center zIndexRange={[20, 0]} style={{ direction: "ltr" }}>
        <Bubble profile={profile} messages={messages} emote={emote}
          onSelect={() => officeUi.set({ selectedUserId: officeUi.get().selectedUserId === profile.id ? null : profile.id })} />
      </Html>
    </group>
  );
}

export function Avatars({ remotes, profiles, messages, voiceDistance }: {
  remotes: React.RefObject<Map<string, RemoteAvatar>>; profiles: Profile[]; messages: Message[];
  voiceDistance: (pos: [number, number], userId: string) => void;
}) {
  const [visible, setVisible] = useState<string[]>([]);
  useFrame(() => {
    const now = performance.now();
    const ids = [...remotes.current.values()].filter((r) => now - r.receivedAt < 5000).map((r) => r.userId).sort();
    if (ids.join() !== visible.join()) setVisible(ids);
    for (const r of remotes.current.values()) voiceDistance([r.pose.x, r.pose.z], r.userId);
  });
  return (
    <>
      {visible.map((id) => {
        const profile = profiles.find((p) => p.id === id);
        if (!profile) return null;
        return <RemoteCharacter key={id} remotes={remotes} profile={profile} messages={messages.filter((m) => m.authorId === id)} />;
      })}
    </>
  );
}
