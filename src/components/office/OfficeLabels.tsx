'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Message, Profile } from '@/lib/data/types';
import type { RemoteAvatar } from './useOfficeNet';
import { emoteEmoji } from './emotes';
import { officeUi, useOfficeUi } from './store';
import { Nameplate } from './Nameplate';
import { SpeechBubble, BubbleButton, TypingBubble, TAIL_HEIGHT } from './SpeechBubble';
import { EmoteStickers } from './EmoteStickers';
import { labelRef, useLabelsVersion, usePresentPeople } from './labels';
import { useHands } from '@/lib/board/hands';

const BUBBLE_MS = 15000; // a new message stays above the head this long after it arrives
const BUBBLE_MAX_AGE_MS = 120000; // older messages (e.g. already there when the office opened) never pop up
export const STATUS_DOT: Record<string, string> = { online: '#3ee07a', busy: '#f5a524', focus: '#6aa8ff' };

export interface LabelTexts { locale: string; older: string; newer: string; receptionist: string }

// Re-renders every second while something can expire (bubbles, emotes, "typing…").
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// Root of one label: an empty point that LabelProjector moves onto the head and scales; what it holds
// is laid out around that point in "world pixels" (METRES_PER_PX each).
const ROOT = 'invisible absolute top-0 left-0 origin-top-left transition-opacity duration-200';

function PersonLabel({ profile, messages, remote, now, selected, seenAt, texts }: {
  profile: Profile; messages: Message[]; remote: RemoteAvatar | undefined; now: number; selected: boolean; seenAt: number; texts: LabelTexts;
}) {
  // Message shown while browsing the history (tap the name or the bubble); null = the newest.
  const [at, setAt] = useState<number | null>(null);
  const [personSeen, setPersonSeen] = useState(() => Date.now());
  useEffect(() => { if (selected) setPersonSeen(Date.now()); else setAt(null); }, [selected, messages.length]);
  const latest = messages.at(-1);
  // Timed from when the message reached this device: without Realtime (polling) it can come in late.
  const [arrival, setArrival] = useState<{ id: string; at: number } | null>(null);
  useEffect(() => {
    if (latest && Date.now() - Date.parse(latest.createdAt) < BUBBLE_MAX_AGE_MS) setArrival((a) => (a?.id === latest.id ? a : { id: latest.id, at: Date.now() }));
  }, [latest]);
  const fresh = !!latest && arrival?.id === latest.id && now - arrival.at < BUBBLE_MS;
  const emote = remote?.emote && remote.emote.until > now ? remote.emote : null;
  const typing = !!remote && remote.typing > now;
  const seen = Math.max(personSeen, seenAt);
  const unread = selected ? 0 : messages.filter((m) => Date.parse(m.createdAt) > seen).length;
  const index = Math.min(at ?? messages.length - 1, messages.length - 1);
  const shown = selected ? messages[index] : fresh ? latest : undefined;
  const dot = STATUS_DOT[profile.status] ?? STATUS_DOT.online;
  const hand = useHands().includes(profile.id);
  return (
    <div ref={labelRef(profile.id)} className={ROOT}>
      {emote && <EmoteStickers key={emote.until} id={emote.id} />}
      <div className="pointer-events-auto absolute bottom-2 left-0 flex w-max -translate-x-1/2 cursor-pointer flex-col items-center"
        onClick={(e) => { e.stopPropagation(); officeUi.set({ selectedUserId: selected ? null : profile.id }); }}>
        {shown ? (
          <div style={{ paddingBottom: TAIL_HEIGHT }}>
            <SpeechBubble name={profile.displayName} characterId={profile.characterId} dot={dot} className="w-max max-w-[300px] min-w-52"
              chip={selected ? `${index + 1}/${messages.length}` : formatTime(texts.locale, shown.createdAt)}
              action={selected && messages.length > 1 ? (
                <>
                  <BubbleButton onClick={() => setAt(Math.max(0, index - 1))} disabled={index === 0} label={texts.older}><ChevronLeft className="size-5" /></BubbleButton>
                  <BubbleButton onClick={() => setAt(Math.min(messages.length - 1, index + 1))} disabled={index === messages.length - 1} label={texts.newer}><ChevronRight className="size-5" /></BubbleButton>
                </>
              ) : undefined}>
              <p className={clsx('break-words whitespace-pre-wrap', !selected && 'line-clamp-4')}>{shown.body || '📎'}</p>
            </SpeechBubble>
          </div>
        ) : (
          <>
            {typing && <TypingBubble />}
            <Nameplate name={profile.displayName} characterId={profile.characterId} dot={dot} unread={unread} emoji={emote ? emoteEmoji(emote.id) : undefined} hand={hand} />
          </>
        )}
      </div>
    </div>
  );
}

// Everything above the heads in the 3D office: the receptionist's name while she works, and for each
// teammate in view their name, newest message (15 s, or the history while selected), "typing…" and emote.
export function OfficeLabels({ profiles, messages, remotes, seenAt, texts }: {
  profiles: Profile[]; messages: Message[]; remotes: React.RefObject<Map<string, RemoteAvatar>>; seenAt: number; texts: LabelTexts;
}) {
  const ids = usePresentPeople();
  useLabelsVersion();
  const now = useNow(ids.length > 0);
  const selected = useOfficeUi((s) => s.selectedUserId);
  return (
    <div dir="ltr" className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      <div ref={labelRef('receptionist')} className={ROOT}>
        <div className="absolute bottom-2 left-0 -translate-x-1/2"><Nameplate name={texts.receptionist} crown typing /></div>
      </div>
      {ids.map((id) => {
        const profile = profiles.find((p) => p.id === id);
        if (!profile) return null;
        return <PersonLabel key={id} profile={profile} messages={messages.filter((m) => m.authorId === id)} remote={remotes.current.get(id)}
          now={now} selected={selected === id} seenAt={seenAt} texts={texts} />;
      })}
    </div>
  );
}
