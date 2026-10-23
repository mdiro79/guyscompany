'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Mic, MicOff, Smile, Gauge, Maximize2, Minimize2, Armchair, Hand, MessageSquare, X } from 'lucide-react';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { useVoice } from '@/components/voice/VoiceContext';
import { getMesh } from '@/lib/realtime/mesh';
import { useDevice } from '@/lib/device';
import { recordVisitAction } from '@/app/actions/offices';
import type { FileMeta, Message } from '@/lib/data/types';
import { useOfficeNet } from './useOfficeNet';
import { officeUi, input, useOfficeUi } from './store';
import { EMOTES } from './emotes';
import { officeAt, inConference } from './layout';
import { TouchControls } from './TouchControls';
import { OfficePanel } from './OfficePanel';
import { Tutorial } from './Tutorial';

const OfficeScene = dynamic(() => import('./OfficeScene'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#2a221c]">
      <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-[#f07a2a]" />
    </div>
  ),
});

export function OfficeView({ messages, privateChats, invitedSlots, files }: { messages: Message[]; privateChats: Record<number, Message[]>; invitedSlots: number[]; files: FileMeta[] }) {
  const t = useTranslations('office');
  const te = useTranslations('emotes');
  const locale = useLocale();
  const { user, profiles, offices } = useShell();
  const voice = useVoice();
  const device = useDevice();
  const isPhone = device === 'phone';
  const mesh = useMemo(() => getMesh(user.id, device), [user.id, device]);
  const net = useOfficeNet(mesh, user.id);
  const ui = useOfficeUi((s) => s);
  const [tutorial, setTutorial] = useState(!user.tutorialDone);
  const [myPos, setMyPos] = useState<[number, number]>([0, 11.6]);
  const [guestChat, setGuestChat] = useState(false);

  useEffect(() => { officeUi.set({ lowQuality: isPhone }); }, [isPhone]);
  // Test hook used by screenshot scripts: place the camera like a command from another device.
  useEffect(() => {
    (window as unknown as { __gcSetPose?: unknown }).__gcSetPose = (x: number, z: number, yaw: number, seatId: string | null = null) => {
      net.external.current = { x, z, yaw, pitch: 0, moving: 0, seatId, t: Date.now() + 1e9 };
    };
    (window as unknown as { __gcRemote?: unknown }).__gcRemote = (userId: string, x: number, z: number, yaw: number, moving = 0, seatId: string | null = null, emote: string | null = null) => {
      net.remotes.current.set(userId, { userId, pose: { x, z, yaw, pitch: 0, moving, seatId, t: Date.now() }, receivedAt: performance.now() + 6e7, emote: emote ? { id: emote as never, until: Date.now() + 6e7 } : null });
    };
  }, [net]);
  useEffect(() => {
    if (!ui.myEmote) return;
    const id = setTimeout(() => officeUi.set({ myEmote: null }), Math.max(0, ui.myEmote.until - Date.now()));
    return () => clearTimeout(id);
  }, [ui.myEmote]);
  useEffect(() => () => officeUi.set({ seatId: null, panel: 'none', emoteWheel: false }), []);

  // Keyboard shortcuts that live outside the 3D canvas.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.code === 'KeyQ' && !e.repeat) officeUi.set({ emoteWheel: !officeUi.get().emoteWheel });
      if (e.code === 'KeyM' && !e.repeat) voice.toggleMic();
      if (e.code === 'Escape') officeUi.set({ emoteWheel: false, selectedUserId: null });
      const n = Number(e.key);
      if (officeUi.get().emoteWheel && n >= 1 && n <= 9) { net.sendEmote(EMOTES[n - 1].id); officeUi.set({ emoteWheel: false }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [voice, net]);

  // Record a visit when entering someone else's office.
  useEffect(() => {
    if (!ui.currentSlot) return;
    const o = offices.find((x) => x.slot === ui.currentSlot);
    if (o?.ownerId && o.ownerId !== user.id) void recordVisitAction(ui.currentSlot);
  }, [ui.currentSlot, offices, user.id]);

  const onPose = useCallback((p: { x: number; z: number }) => {
    net.sendPose(p as never);
    setMyPos((prev) => (Math.abs(prev[0] - p.x) + Math.abs(prev[1] - p.z) > 0.25 ? [p.x, p.z] : prev));
  }, [net]);

  // Proximity voice: full volume in the same room, fading with distance; muted through closed offices.
  const voiceDistance = useCallback((pos: [number, number], userId: string) => {
    const d = Math.hypot(pos[0] - myPos[0], pos[1] - myPos[1]);
    const a = officeAt(...pos)?.slot ?? (inConference(...pos) ? 0 : -1);
    const b = officeAt(...myPos)?.slot ?? (inConference(...myPos) ? 0 : -1);
    let v = a === b && a !== -1 ? 1 : Math.max(0, Math.min(1, 1 - (d - 2) / 10));
    const closed = offices.find((o) => (o.slot === a || o.slot === b) && a !== b && (o.glass === 'frosted' || o.locked || o.focus));
    if (closed) v *= 0.15;
    voice.setVolume(userId, v);
  }, [myPos, offices, voice]);

  const current = offices.find((o) => o.slot === ui.currentSlot) ?? null;
  const owner = current ? profiles.find((p) => p.id === current.ownerId) : null;
  const place = current ? (owner ? t('officeOf', { name: owner.displayName }) : t('emptyOffice', { slot: current.slot })) : ui.inConference ? t('conference') : myPos[1] > 7 ? t('reception') : Math.abs(myPos[0]) > 9.5 ? t('lounge') : t('corridor');
  const myOffice = offices.find((o) => o.ownerId === user.id);
  const inMyOffice = !!current && current.ownerId === user.id;
  const Back = locale === 'fa' ? ArrowRight : ArrowLeft;

  return (
    <div className="fixed inset-0 bg-[#2a221c] text-white select-none">
      <OfficeScene user={user} profiles={profiles} offices={offices} messages={messages} invitedSlots={invitedSlots} lowQuality={ui.lowQuality} isPhone={isPhone}
        receptionLabel={t('reception')} remotes={net.remotes} external={net.external} onPose={onPose} voiceDistance={voiceDistance} />
      {isPhone && !ui.seatId && <TouchControls />}

      {/* Dashboard on the monitor / fullscreen (single iframe keeps state) */}
      <div id="gc-monitor-frame" className="absolute z-20 hidden overflow-hidden bg-white shadow-2xl">
        {ui.panel !== 'none' && <iframe title="dashboard" src={`/${locale}?embed=1`} className="size-full border-0" />}
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/" className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-xl bg-black/55 px-3 text-sm backdrop-blur hover:bg-black/70"><Back className="size-4" />{t('back')}</Link>
        <div className="rounded-xl bg-black/55 px-3 py-2 text-sm backdrop-blur">
          <div className="font-semibold">{place}</div>
          {current && current.ownerId !== user.id && current.focus && <div className="text-xs text-[#9cc4ff]">{t('focusOn')}</div>}
          {current && current.ownerId !== user.id && current.isPublic && <div className="text-xs text-white/70">{t('viewOnly')}</div>}
        </div>
        <div className="pointer-events-auto ms-auto flex gap-2">
          <button type="button" onClick={voice.toggleMic} aria-label={t('mic')} className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', voice.micOn ? 'bg-[#22a559]' : 'bg-black/55')}>
            {voice.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          </button>
          <button type="button" onClick={() => officeUi.set({ emoteWheel: !ui.emoteWheel })} aria-label={t('emotes')} className="flex size-11 items-center justify-center rounded-xl bg-black/55 backdrop-blur"><Smile className="size-5" /></button>
          <button type="button" onClick={() => officeUi.set({ lowQuality: !ui.lowQuality })} aria-label={ui.lowQuality ? t('highQuality') : t('lowQuality')} title={ui.lowQuality ? t('highQuality') : t('lowQuality')}
            className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', ui.lowQuality ? 'bg-[#f07a2a]' : 'bg-black/55')}><Gauge className="size-5" /></button>
        </div>
      </div>

      {/* Crosshair and hints */}
      {!ui.seatId && !isPhone && <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!isPhone && !ui.locked && !ui.seatId && <div className="rounded-xl bg-black/60 px-4 py-2 text-sm">{t('clickToLook')}</div>}
        {!ui.seatId && ui.nearSeatId && !isPhone && <div className="rounded-xl bg-[#2f5d45]/90 px-4 py-2 text-sm">{t('pressE')}</div>}
        {ui.seatId && !isPhone && ui.panel !== 'fullscreen' && <div className="rounded-xl bg-black/60 px-4 py-2 text-sm">{t('standHint')}</div>}
        {!isPhone && !ui.seatId && <div className="hidden rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80 md:block">{t('controlsDesktop')}</div>}
        {isPhone && !ui.seatId && <div className="rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80">{t('controlsMobile')}</div>}
      </div>

      {/* Seat actions */}
      {(ui.seatId || (isPhone && ui.nearSeatId)) && (
        <div className="absolute bottom-6 end-4 z-40 flex flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)]">
          {ui.seatId && ui.panel !== 'none' && (
            <button type="button" className="flex min-h-11 items-center gap-2 rounded-xl bg-black/70 px-4 text-sm" onClick={() => officeUi.set({ panel: ui.panel === 'fullscreen' ? 'monitor' : 'fullscreen' })}>
              {ui.panel === 'fullscreen' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{ui.panel === 'fullscreen' ? t('monitor') : t('fullscreen')}
            </button>
          )}
          <button type="button" className="flex min-h-14 items-center gap-2 rounded-2xl bg-[#2f5d45] px-5 text-base font-semibold shadow-lg" onClick={() => { input.action = true; }}>
            {ui.seatId ? <Hand className="size-5" /> : <Armchair className="size-5" />}{ui.seatId ? t('stand') : t('sit')}
          </button>
        </div>
      )}

      {/* Emote wheel */}
      {ui.emoteWheel && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => officeUi.set({ emoteWheel: false })}>
          <div className="grid grid-cols-4 gap-2 rounded-3xl bg-black/70 p-4 backdrop-blur" onClick={(e) => e.stopPropagation()}>
            {EMOTES.map((e, i) => (
              <button key={e.id} type="button" className="flex size-20 flex-col items-center justify-center rounded-2xl hover:bg-white/15"
                onClick={() => { net.sendEmote(e.id); officeUi.set({ emoteWheel: false }); }}>
                <span className="text-3xl">{e.emoji}</span>
                <span className="text-[11px] text-white/80">{i < 9 && !isPhone ? `${i + 1} · ` : ''}{te(e.id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ui.myEmote && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-white/90 px-4 py-2 text-3xl shadow">{EMOTES.find((e) => e.id === ui.myEmote!.id)?.emoji}</div>
      )}

      {/* Owner controls inside one's own office */}
      {inMyOffice && myOffice && !ui.seatId && (
        <div className="absolute top-20 end-3 z-30"><OfficePanel office={myOffice} profiles={profiles} me={user} privateMessages={privateChats[myOffice.slot] ?? []} files={files} /></div>
      )}

      {/* Private chat for invited guests inside the host's office */}
      {current && !inMyOffice && invitedSlots.includes(current.slot) && !ui.seatId && (
        <div className="absolute top-20 end-3 z-30 flex flex-col items-end gap-2">
          <button type="button" className="flex min-h-11 items-center gap-2 rounded-xl bg-black/60 px-3 text-sm backdrop-blur" onClick={() => setGuestChat((x) => !x)}>
            {guestChat ? <X className="size-4" /> : <MessageSquare className="size-4" />}{t('privateChat')}
          </button>
          {guestChat && (
            <div className="h-80 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-surface text-ink">
              <ChatPanel channel={`office:${current.slot}`} messages={privateChats[current.slot] ?? []} files={files} title={t('privateChat')} className="h-full" />
            </div>
          )}
        </div>
      )}

      {tutorial && <Tutorial onDone={() => setTutorial(false)} />}
    </div>
  );
}
