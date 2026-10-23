'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Message, Profile } from '@/lib/data/types';
import { CharacterModel, CHARACTER_HEIGHT, type Motion } from '@/components/three/CharacterModel';
import { getCharacter, isFlying } from '@/lib/characters';
import { useVoice } from '@/components/voice/VoiceContext';
import { allSeats } from './layout';
import type { RemoteAvatar } from './useOfficeNet';
import { emoteEmoji } from './emotes';
import { officeUi, useOfficeUi } from './store';
import { Nameplate } from './Nameplate';
import { GroundShadow } from './GroundShadow';
import { SpeechBubble, BubbleButton, TAIL_HEIGHT } from './SpeechBubble';

const SEATS = allSeats();
const BUBBLE_MS = 15000;
const TOP_SAFE = 84; // below the office top bar

const STATUS_DOT: Record<string, string> = { online: '#3ee07a', busy: '#f5a524', focus: '#6aa8ff' };

// Strings and locale for the labels (drei's <Html> renders in its own React root, outside next-intl).
export interface AvatarLabels { locale: string; older: string; newer: string }

function Bubble({ profile, messages, emote, talk, labels, onSelect }: {
  profile: Profile; messages: Message[]; emote: string | null; talk: number; labels: AvatarLabels; onSelect: () => void;
}) {
  const selected = useOfficeUi((s) => s.selectedUserId === profile.id);
  const [seen, setSeen] = useState(messages.length);
  // Message shown while browsing the history (tap the bubble or the name); null = the newest.
  const [at, setAt] = useState<number | null>(null);
  const latest = messages.at(-1);
  const fresh = latest && Date.now() - new Date(latest.createdAt).getTime() < BUBBLE_MS;
  const unread = Math.max(0, messages.length - seen);
  useEffect(() => { if (selected) setSeen(messages.length); else setAt(null); }, [selected, messages.length]);
  // Close up the bubble would leave the top of the screen: it slides down (over the character) and drops its tail.
  const bubbleRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = bubbleRef.current, n = plateRef.current;
      if (b && n) {
        const shift = Math.max(0, TOP_SAFE - (n.getBoundingClientRect().top - b.offsetHeight));
        b.style.transform = shift ? `translateY(${shift}px)` : '';
        b.dataset.tail = shift ? '0' : '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const index = Math.min(at ?? messages.length - 1, messages.length - 1);
  const shown = selected ? messages[index] : latest;
  const open = selected ? messages.length > 0 : !!(emote || fresh);
  return (
    <div dir="ltr" className="pointer-events-auto flex w-max -translate-y-full cursor-pointer flex-col items-center" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      {open && (
        <div ref={bubbleRef} className="group relative z-10 w-64" style={{ paddingBottom: TAIL_HEIGHT - 6 }}>
          <SpeechBubble characterId={profile.characterId} title={profile.displayName}
            chip={selected ? `${index + 1}/${messages.length}` : shown ? formatTime(labels.locale, shown.createdAt) : undefined}
            action={selected && messages.length > 1 ? (
              <>
                <BubbleButton onClick={() => setAt(Math.max(0, index - 1))} disabled={index === 0} label={labels.older}><ChevronLeft className="size-5" /></BubbleButton>
                <BubbleButton onClick={() => setAt(Math.min(messages.length - 1, index + 1))} disabled={index === messages.length - 1} label={labels.newer}><ChevronRight className="size-5" /></BubbleButton>
              </>
            ) : undefined}>
            {emote && !selected ? <span className="text-3xl leading-none">{emote}</span>
              : <p className={clsx('break-words whitespace-pre-wrap', !selected && 'line-clamp-3')}>{shown?.body || '📎'}</p>}
          </SpeechBubble>
        </div>
      )}
      <div ref={plateRef} data-avatar-label>
        <Nameplate name={profile.displayName} characterId={profile.characterId} dot={STATUS_DOT[profile.status] ?? STATUS_DOT.online}
          level={talk} unread={selected ? 0 : unread} />
      </div>
    </div>
  );
}

function RemoteCharacter({ remotes, profile, messages, labels }: { remotes: React.RefObject<Map<string, RemoteAvatar>>; profile: Profile; messages: Message[]; labels: AvatarLabels }) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Group>(null); // stays on the floor under flying characters too
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
    shadow.current?.position.set(g.position.x, 0, g.position.z);
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
    <>
    <group ref={shadow}><GroundShadow size={[0.75, 0.75]} opacity={0.35} /></group>
    <group ref={group}>
      <Suspense fallback={null}><CharacterModel characterId={profile.characterId} motion={motion} talkLevel={talk} /></Suspense>
      <Html position={[0, CHARACTER_HEIGHT + 0.12, 0]} center zIndexRange={[20, 0]} style={{ direction: "ltr" }}>
        <Bubble profile={profile} messages={messages} emote={emote} talk={talk} labels={labels}
          onSelect={() => officeUi.set({ selectedUserId: officeUi.get().selectedUserId === profile.id ? null : profile.id })} />
      </Html>
    </group>
    </>
  );
}

export function Avatars({ remotes, profiles, messages, labels, voiceDistance }: {
  remotes: React.RefObject<Map<string, RemoteAvatar>>; profiles: Profile[]; messages: Message[]; labels: AvatarLabels;
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
        return <RemoteCharacter key={id} remotes={remotes} profile={profile} messages={messages.filter((m) => m.authorId === id)} labels={labels} />;
      })}
    </>
  );
}
