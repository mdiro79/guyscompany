'use client';
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Mic, MicOff, Smile, Gauge, Maximize2, Minimize2, Armchair, Hand, MessageSquare, X, DoorOpen, DoorClosed, Lock, LogOut, SlidersHorizontal, EyeOff, Target, ChevronDown, PenLine, Cast } from 'lucide-react';
import { usePresenter } from '@/lib/board/sync';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { useVoice } from '@/components/voice/VoiceContext';
import { getMesh } from '@/lib/realtime/mesh';
import { useDevice, isEmbedded } from '@/lib/device';
import { recordVisitAction, updateMyOfficeAction } from '@/app/actions/offices';
import type { FileMeta, Message, Room } from '@/lib/data/types';
import { useOfficeNet } from './useOfficeNet';
import { officeUi, input, useOfficeUi } from './store';
import { EMOTES } from './emotes';
import { officeAt, inConference, areaAt, allSeats, SPAWN } from './layout';
import { connectDoors } from './doors';
import { connectRoomControls, roomControls } from './roomControls';
import { RoomControls } from './RoomControls';
import { canLook } from './Player';
import { startTourFor, useTourStep } from './tour';
import { TouchControls } from './TouchControls';
import { OfficePanel, type OfficeSettings, type OfficeTab } from './OfficePanel';
import { MonitorDashboard } from './MonitorDashboard';
import { Tutorial } from './Tutorial';
import { TabCursor } from './TabCursor';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';

// The drawing board is a separate chunk, loaded the first time it is opened.
const BoardApp = dynamic(() => import('@/components/board/BoardApp').then((m) => m.BoardApp), { ssr: false });

// Shown while the 3D code downloads; the scene then reports real model progress from where this leaves off.
function SceneLoading() {
  const t = useTranslations('office');
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#2a221c]">
      <div className="w-[min(20rem,80vw)]"><ProgressBar percent={0} label={t('loadingModels')} dark /></div>
    </div>
  );
}

const OfficeScene = dynamic(() => import('./OfficeScene'), { ssr: false, loading: SceneLoading });
const SEATS = allSeats();
const MONITOR_PRELOAD_MS = 8000;

const canvas = () => document.querySelector<HTMLCanvasElement>('#gc-office canvas');

export function OfficeView({ messages, privateChats, invitedSlots, files, room }: { messages: Message[]; privateChats: Record<number, Message[]>; invitedSlots: number[]; files: FileMeta[]; room: Room | null }) {
  const t = useTranslations('office');
  const te = useTranslations('emotes');
  const tErr = useTranslations('errors');
  const tb = useTranslations('board');
  const presenterId = usePresenter();
  const locale = useLocale();
  const { user, profiles, offices: savedOffices } = useShell();
  // The owner's office settings apply at once (glass, door, panel) while they save; failures roll back.
  const [offices, applyOffice] = useOptimistic(savedOffices, (list, { slot, patch }: { slot: number; patch: OfficeSettings }) =>
    list.map((o) => (o.slot === slot ? { ...o, ...patch } : o)));
  const voice = useVoice();
  const device = useDevice();
  const isPhone = device === 'phone';
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    // "Enter office" clicked on the dashboard shown on the monitor: we are already there, so just stand up.
    if (isEmbedded()) { setEmbedded(true); window.parent.postMessage({ type: 'gc-leave-monitor' }, window.location.origin); return; }
    const h = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === 'gc-leave-monitor' && officeUi.get().seatId) input.action = true; };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  // Never run a second office inside the dashboard iframe (it would join the mesh as this user).
  const avatarLabels = useMemo(() => ({ locale, older: t('olderMessage'), newer: t('newerMessage') }), [locale, t]);
  const meetingLabels = useMemo(() => ({
    title: t('meeting.title'), subtitle: t('meeting.subtitle'), raiseHand: t('meeting.raiseHand'), shareIdea: t('meeting.shareIdea'),
    shareImage: t('meeting.shareImage'), shareScreen: t('meeting.shareScreen'), more: t('meeting.more'), rtl: locale === 'fa',
  }), [locale, t]);
  const mesh = useMemo(() => (embedded ? null : getMesh(user.id, device)), [embedded, user.id, device]);
  const net = useOfficeNet(mesh, user.id);
  const ui = useOfficeUi((s) => s);
  const tourStep = useTourStep();
  const [myPos, setMyPos] = useState<[number, number]>([...SPAWN.pos]);
  const [guestChat, setGuestChat] = useState(false);
  const relock = useRef(false);
  const seat = ui.seatId ? SEATS.find((s) => s.id === ui.seatId) ?? null : null;
  const working = !!seat?.monitor; // at a desk with the dashboard on the monitor

  // The desk dashboard loads in the background once the office had time to load, so sitting down is instant.
  const [preloadMonitor, setPreloadMonitor] = useState(false);
  useEffect(() => { const id = setTimeout(() => setPreloadMonitor(true), MONITOR_PRELOAD_MS); return () => clearTimeout(id); }, []);
  useEffect(() => connectDoors(mesh), [mesh]);
  // Conference room light and glass: live from the others over WebRTC, the saved value from the page data.
  useEffect(() => connectRoomControls(mesh), [mesh]);
  useEffect(() => { if (room) roomControls.load(room); }, [room]);
  // The wall panel's controls close when you leave the room.
  useEffect(() => { if (!ui.inConference) officeUi.set({ roomPanel: false }); }, [ui.inConference]);
  // First visit: the receptionist starts her tour once the scene had a moment to load.
  const tutorialDone = useRef(user.tutorialDone);
  useEffect(() => {
    if (tutorialDone.current || embedded) return;
    const id = setTimeout(() => startTourFor(offices, user.id), 2500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded]);
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
  useEffect(() => () => officeUi.set({ seatId: null, panel: 'none', emoteWheel: false, interact: null, roomPanel: false, board: 'none' }), []);
  // Leaving the office restores full volume for everyone (proximity only applies in 3D).
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  useEffect(() => () => { for (const p of profiles) voiceRef.current.setVolume(p.id, 1); }, [profiles]);

  const openWheel = useCallback((open: boolean) => {
    if (open && document.pointerLockElement) { relock.current = true; document.exitPointerLock(); }
    officeUi.set({ emoteWheel: open });
  }, []);
  const sendEmote = useCallback((id: (typeof EMOTES)[number]['id']) => {
    net.sendEmote(id);
    officeUi.set({ emoteWheel: false });
    if (relock.current && canLook()) canvas()?.requestPointerLock?.();
    relock.current = false;
  }, [net]);

  // Keyboard shortcuts that live outside the 3D canvas.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (officeUi.get().board !== 'none') return;
      // Tab switches between mouse look and the on-screen cursor (computers).
      if (e.code === 'Tab' && !isPhone) {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        else if (canLook()) canvas()?.requestPointerLock?.();
        return;
      }
      if (e.code === 'KeyQ' && !e.repeat && !working) openWheel(!officeUi.get().emoteWheel);
      if (e.code === 'KeyM' && !e.repeat) voice.toggleMic();
      if (e.code === 'Escape') officeUi.set({ emoteWheel: false, selectedUserId: null, roomPanel: false });
      const n = Number(e.key);
      if (officeUi.get().emoteWheel && n >= 1 && n <= 9) sendEmote(EMOTES[n - 1].id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [voice, isPhone, working, openWheel, sendEmote]);

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

  // Owner panel of one's office: closed by default (a small pill in the top bar), closed again on leaving.
  const [officeTab, setOfficeTab] = useState<OfficeTab | null>(null);
  const inOwnOffice = ui.currentSlot !== null && savedOffices.some((o) => o.slot === ui.currentSlot && o.ownerId === user.id);
  useEffect(() => { if (!inOwnOffice) setOfficeTab(null); }, [inOwnOffice]);

  // Called inside the panel's transition, which keeps the optimistic change until the saved data arrives.
  const mySlot = savedOffices.find((o) => o.ownerId === user.id)?.slot;
  const changeMyOffice = useCallback((patch: OfficeSettings) => {
    if (mySlot !== undefined) applyOffice({ slot: mySlot, patch });
    return updateMyOfficeAction(patch);
  }, [mySlot, applyOffice]);

  if (embedded) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-muted">{t('embedded')}</div>;
  }

  const current = offices.find((o) => o.slot === ui.currentSlot) ?? null;
  const owner = current ? profiles.find((p) => p.id === current.ownerId) : null;
  const area = areaAt(...myPos);
  const place = current ? (owner ? t('officeOf', { name: owner.displayName }) : t('emptyOffice', { slot: current.slot })) : t(area === 'office' ? 'corridor' : area);
  const myOffice = offices.find((o) => o.ownerId === user.id);
  const inMyOffice = !!current && current.ownerId === user.id;
  const Back = locale === 'fa' ? ArrowRight : ArrowLeft;
  const touring = tourStep !== null;
  // Drawing board: one's own at a conference seat; the presenter's ("view screen") anywhere in the room.
  const atTable = seat?.area === 'conference';
  const someoneElsePresents = !!presenterId && presenterId !== user.id;
  const presenterName = profiles.find((p) => p.id === presenterId)?.displayName ?? '';
  const openBoard = (mode: 'mine' | 'screen') => {
    if (document.pointerLockElement) document.exitPointerLock();
    officeUi.set({ board: mode, emoteWheel: false, roomPanel: false });
  };
  const officeControls = inMyOffice && !!myOffice && !ui.seatId && !touring;
  const showCursor = !isPhone && !ui.locked && !(working && ui.panel !== 'none');
  const it = ui.interact;
  const hint = ui.seatId ? (working ? null : t('standHint'))
    : !it ? null
      : it.kind === 'seat' ? t('pressE')
        : it.kind === 'guide' ? t('pressTalk')
          : it.kind === 'panel' ? t('pressPanel')
          : !it.allowed ? t('noAccess') : it.open ? t('pressClose') : t('pressOpen');
  const action = ui.seatId ? { icon: Hand, label: t('stand') }
    : !it ? null
      : it.kind === 'seat' ? { icon: Armchair, label: t('sit') }
        : it.kind === 'guide' ? { icon: MessageSquare, label: t('talk') }
          : it.kind === 'panel' ? { icon: SlidersHorizontal, label: t('roomControls') }
          : !it.allowed ? { icon: Lock, label: t('noAccess'), disabled: true }
            : { icon: it.open ? DoorClosed : DoorOpen, label: it.open ? t('closeDoor') : t('openDoor') };

  const workBar = (
    <>
      <button type="button" className="flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm hover:bg-white/25"
        onClick={() => officeUi.set({ panel: ui.panel === 'fullscreen' ? 'monitor' : 'fullscreen' })} disabled={ui.panel === 'none'}>
        {ui.panel === 'fullscreen' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{ui.panel === 'fullscreen' ? t('monitor') : t('fullscreen')}
      </button>
      <button type="button" className="flex min-h-10 items-center gap-2 rounded-xl bg-[#d9443c] px-3 text-sm font-semibold hover:opacity-90" onClick={() => { input.action = true; }}>
        <LogOut className="size-4 rtl:-scale-x-100" />{t('exit')}
      </button>
    </>
  );

  return (
    <div id="gc-office" className={clsx('fixed inset-0 bg-[#2a221c] text-white select-none', showCursor && 'cursor-none [&_*]:cursor-none')}>
      <OfficeScene user={user} profiles={profiles} offices={offices} messages={messages} invitedSlots={invitedSlots} lowQuality={ui.lowQuality} isPhone={isPhone}
        receptionLabel={t('receptionist')} loadingLabel={t('loadingModels')} avatarLabels={avatarLabels} meetingLabels={meetingLabels} remotes={net.remotes} external={net.external} onPose={onPose} voiceDistance={voiceDistance} />
      {isPhone && !touring && !working && <TouchControls lookOnly={!!ui.seatId} />}

      {/* Dashboard on the monitor / fullscreen (single iframe keeps state) */}
      <div id="gc-monitor-frame" className="absolute z-20 hidden overflow-hidden bg-white shadow-2xl">
        <MonitorDashboard src={`/${locale}?embed=1`} show={ui.panel !== 'none'} preload={preloadMonitor}
          labels={{ loading: t('loadingDashboard'), retrying: t('reconnectingDashboard'), failed: t('dashboardFailed'), retry: tErr('retry') }} />
      </div>

      {/* Working at the computer: only fullscreen and exit. In fullscreen they sit in their own bar above the dashboard. */}
      {working && (ui.panel === 'fullscreen' ? (
        <div className="absolute inset-x-0 top-0 z-40 flex h-12 items-center gap-2 bg-[#1f1a16] px-3 pt-[env(safe-area-inset-top)] box-content">
          <span className="me-auto truncate text-sm font-semibold">{place}</span>
          {workBar}
        </div>
      ) : (
        <div className="absolute top-3 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-2xl bg-black/60 p-1.5 backdrop-blur pt-[max(0.375rem,env(safe-area-inset-top))]">{workBar}</div>
      ))}

      {/* Top bar */}
      {!working && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] short:p-2">
          <Link href="/" className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-xl bg-black/55 px-3 text-sm backdrop-blur hover:bg-black/70"><Back className="size-4" /><span className="max-sm:hidden short:hidden">{t('back')}</span></Link>
          {officeControls ? (
            // In one's own office the place name is the small "my office" button: the panel opens below it,
            // and frosted glass, lock and focus show at a glance while it is closed.
            <button type="button" onClick={() => setOfficeTab(officeTab ? null : 'settings')} aria-expanded={!!officeTab} title={t('myOffice')}
              className={clsx('pointer-events-auto flex min-h-11 min-w-0 touch-manipulation items-center gap-2 rounded-xl px-3 text-sm backdrop-blur transition-colors',
                officeTab ? 'bg-[#2f5d45]' : 'bg-black/55 hover:bg-black/70')}>
              <SlidersHorizontal className="size-4 shrink-0" />
              <span className="truncate font-semibold">{place}</span>
              {myOffice.glass === 'frosted' && <EyeOff className="size-3.5 shrink-0 text-white/75" />}
              {myOffice.locked && <Lock className="size-3.5 shrink-0 text-white/75" />}
              {myOffice.focus && <Target className="size-3.5 shrink-0 text-[#9cc4ff]" />}
              <ChevronDown className={clsx('size-4 shrink-0 opacity-70 transition-transform', officeTab && 'rotate-180')} />
            </button>
          ) : (
            <div className="min-w-0 rounded-xl bg-black/55 px-3 py-2 text-sm backdrop-blur">
              <div className="truncate font-semibold">{place}</div>
              {current && current.ownerId !== user.id && current.focus && <div className="text-xs text-[#9cc4ff]">{t('focusOn')}</div>}
              {current && current.ownerId !== user.id && current.isPublic && <div className="text-xs text-white/70">{t('viewOnly')}</div>}
            </div>
          )}
          <div className="pointer-events-auto ms-auto flex gap-2">
            <LocaleSwitch dark className="max-sm:px-3 max-sm:[&>svg]:hidden" />
            <button type="button" onClick={voice.toggleMic} aria-label={t('mic')} className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', voice.micOn ? 'bg-[#22a559]' : 'bg-black/55')}>
              {voice.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <button type="button" onClick={() => openWheel(!ui.emoteWheel)} aria-label={t('emotes')} className="flex size-11 items-center justify-center rounded-xl bg-black/55 backdrop-blur"><Smile className="size-5" /></button>
            <button type="button" onClick={() => officeUi.set({ lowQuality: !ui.lowQuality })} aria-label={ui.lowQuality ? t('highQuality') : t('lowQuality')} title={ui.lowQuality ? t('highQuality') : t('lowQuality')}
              className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', ui.lowQuality ? 'bg-[#f07a2a]' : 'bg-black/55')}><Gauge className="size-5" /></button>
          </div>
        </div>
      )}

      {/* Crosshair and hints */}
      {ui.locked && !working && <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}
      {!working && !touring && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] short:p-2">
          {!isPhone && !ui.locked && <div className="rounded-xl bg-black/60 px-4 py-2 text-sm">{ui.seatId ? t('cursorHint') : t('clickToLook')}</div>}
          {!isPhone && hint && <div className={clsx('rounded-xl px-4 py-2 text-sm', it?.kind === 'door' && !it.allowed ? 'bg-[#d9443c]/90' : 'bg-[#2f5d45]/90')}>{hint}</div>}
          {!isPhone && <div className="hidden rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80 md:block">{t('controlsDesktop')}</div>}
          {isPhone && !ui.seatId && <div className="rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80 short:hidden">{t('controlsMobile')}</div>}
        </div>
      )}

      {/* Contextual action (phones; on computers it's E) */}
      {isPhone && !working && !touring && action && !ui.roomPanel && (
        <div className="absolute end-4 bottom-6 z-40 pb-[env(safe-area-inset-bottom)] short:bottom-3">
          <button type="button" disabled={'disabled' in action} className="flex min-h-14 items-center gap-2 rounded-2xl bg-[#2f5d45] px-5 text-base font-semibold shadow-lg disabled:bg-[#d9443c]/90 short:min-h-12"
            onClick={() => { input.action = true; }}>
            <action.icon className="size-5" />{action.label}
          </button>
        </div>
      )}

      {/* Emote wheel */}
      {ui.emoteWheel && !working && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30" onClick={() => openWheel(false)}>
          <div className="grid grid-cols-4 gap-2 rounded-3xl bg-black/70 p-4 backdrop-blur short:grid-cols-6 short:p-2" onClick={(e) => e.stopPropagation()}>
            {EMOTES.map((e, i) => (
              <button key={e.id} type="button" className="flex size-20 flex-col items-center justify-center rounded-2xl hover:bg-white/15 short:size-16" onClick={() => sendEmote(e.id)}>
                <span className="text-3xl short:text-2xl">{e.emoji}</span>
                <span className="text-[11px] text-white/80">{i < 9 && !isPhone ? `${i + 1} · ` : ''}{te(e.id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ui.myEmote && !working && (
        <div className="pointer-events-none absolute top-20 left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-white/90 px-4 py-2 text-3xl shadow short:top-16">{EMOTES.find((e) => e.id === ui.myEmote!.id)?.emoji}</div>
      )}

      {/* Owner controls inside one's own office */}
      {officeControls && officeTab && (
        <div className="absolute top-[4.25rem] start-3 z-30 short:top-14">
          <OfficePanel office={myOffice} profiles={profiles} me={user} privateMessages={privateChats[myOffice.slot] ?? []} files={files} onChange={changeMyOffice}
            tab={officeTab} onTab={setOfficeTab} />
        </div>
      )}

      {/* Conference room wall panel: light and glass */}
      {ui.roomPanel && !ui.seatId && !touring && (
        <div className="absolute top-[4.25rem] end-3 z-30 short:top-14"><RoomControls onClose={() => officeUi.set({ roomPanel: false })} /></div>
      )}

      {/* Private chat for invited guests inside the host's office */}
      {current && !inMyOffice && invitedSlots.includes(current.slot) && !ui.seatId && !touring && (
        <div className="absolute top-20 end-3 z-30 flex flex-col items-end gap-2 short:top-16">
          <button type="button" className="flex min-h-11 items-center gap-2 rounded-xl bg-black/60 px-3 text-sm backdrop-blur" onClick={() => setGuestChat((x) => !x)}>
            {guestChat ? <X className="size-4" /> : <MessageSquare className="size-4" />}{t('privateChat')}
          </button>
          {guestChat && (
            <div className="h-80 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl bg-surface text-ink short:h-[calc(100dvh-8rem)]">
              <ChatPanel channel={`office:${current.slot}`} messages={privateChats[current.slot] ?? []} files={files} title={t('privateChat')} className="h-full" />
            </div>
          )}
        </div>
      )}

      {/* Drawing board at the conference table, and the presenter's board on demand */}
      {!touring && ui.board === 'none' && (atTable || (someoneElsePresents && ui.inConference)) && (
        <div className="absolute top-[4.25rem] left-1/2 z-30 flex -translate-x-1/2 gap-2 short:top-14">
          {atTable && (
            <button type="button" onClick={() => openBoard('mine')}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-[#2f5d45] px-4 text-sm font-semibold shadow-lg transition-transform active:scale-95">
              <PenLine className="size-4" />{tb('open')}
            </button>
          )}
          {someoneElsePresents && (
            <button type="button" onClick={() => openBoard('screen')} title={tb('presenting', { name: presenterName })}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-black/60 px-4 text-sm font-semibold backdrop-blur transition-transform active:scale-95">
              <Cast className="size-4" />{tb('view')}<span className="size-2 animate-pulse rounded-full bg-[#ff6b5b]" />
            </button>
          )}
        </div>
      )}
      {ui.board !== 'none' && <BoardApp watch={ui.board === 'screen'} onClose={() => officeUi.set({ board: 'none' })} />}

      <Tutorial markDone={!user.tutorialDone} />
      {showCursor && <TabCursor />}
    </div>
  );
}
