'use client';
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Mic, MicOff, Smile, Gauge, Maximize2, Minimize2, Armchair, Hand, MessageSquare, MessageCircle, X, DoorOpen, DoorClosed, Lock, LogOut, SlidersHorizontal, EyeOff, Target, ChevronDown, PenLine, Cast, KeyRound, Map as MapIcon, MoreHorizontal, Gamepad2, Music, Coffee, Timer } from 'lucide-react';
import { invalidate } from '@react-three/fiber';
import { present, usePresenter } from '@/lib/board/sync';
import { raiseHand, useHands } from '@/lib/board/hands';
import { saveRoomAction } from '@/app/actions/rooms';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useChat, PENDING } from '@/components/chat/useChat';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { useVoice } from '@/components/voice/VoiceContext';
import { getMesh } from '@/lib/realtime/mesh';
import { useDevice, isEmbedded } from '@/lib/device';
import { recordVisitAction, updateMyOfficeAction, claimOfficeAction } from '@/app/actions/offices';
import { OFFICE_DEFAULTS, type FileMeta, type Message, type Office, type Room } from '@/lib/data/types';
import { useOfficeNet } from './useOfficeNet';
import { officeUi, input, useOfficeUi } from './store';
import { EMOTES } from './emotes';
import { officeAt, inConference, allSeats, onDanceFloor, SPAWN, CONF_SCREEN } from './layout';
import { MiniMap } from './MiniMap';
import { ArcadeGame } from './play/ArcadeGame';
import { JukeboxPanel } from './play/JukeboxPanel';
import { XoPanel } from './play/XoPanel';
import { FocusTimer, useFocusTimer, clock } from './play/FocusTimer';
import { connectJukebox, jukebox } from './play/jukebox';
import { connectXo } from './play/xo';
import { connectScores } from './play/scores';
import { music } from './play/music';
import { connectDoors, setDoor } from './doors';
import { connectRoomControls, roomControls, useRoomSettings } from './roomControls';
import { tablet, type TabletButton } from './tablet';
import { MeetingPanel, type MeetingPanelMode, type OfficeMeeting } from './MeetingPanel';
import { meetingPresenceAction } from '@/app/actions/meetings';
import { clockText, HEARTBEAT_MS, meetingEnd } from '@/lib/meetings';
import { RoomControls } from './RoomControls';
import { canLook } from './Player';
import { startTourFor, useTourStep, tour } from './tour';
import { TouchControls } from './TouchControls';
import { OfficePanel, type OfficeSettings, type OfficeTab } from './OfficePanel';
import { MonitorDashboard } from './MonitorDashboard';
import { Tutorial } from './Tutorial';
import { TabCursor } from './TabCursor';
import { OfficeLabels } from './OfficeLabels';
import { OfficeChat } from './OfficeChat';
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
const SCREEN_CENTER: [number, number, number] = [0, CONF_SCREEN.bottom + CONF_SCREEN.height / 2, CONF_SCREEN.z];
// Light scenes the tablet switches between (same as the wall panel's Meeting and Present).
const MEETING_LIGHT = { light: 100, warmth: 45 }, PRESENT_LIGHT = { light: 25, warmth: 55 };
const SPLIT_KEY = 'gc-board-split';
const onDance = (p: [number, number]) => onDanceFloor(p[0], p[1]);

const canvas = () => document.querySelector<HTMLCanvasElement>('#gc-office canvas');
// E (or its buttons): also wakes the 3D view when it is paused behind a full-screen panel.
const act = () => { input.action = true; invalidate(); };

export function OfficeView({ messages, privateChats, invitedSlots, files, room, meeting: meetingData }: {
  messages: Message[]; privateChats: Record<number, Message[]>; invitedSlots: number[]; files: FileMeta[]; room: Room | null; meeting: OfficeMeeting;
}) {
  const t = useTranslations('office');
  const tc = useTranslations('common');
  const tChat = useTranslations('chat');
  const te = useTranslations('emotes');
  const tErr = useTranslations('errors');
  const tb = useTranslations('board');
  const presenterId = usePresenter();
  const locale = useLocale();
  const { user, profiles, offices: savedOffices } = useShell();
  // The owner's office settings apply at once (glass, door, panel) while they save; failures roll back.
  const [offices, applyOffice] = useOptimistic(savedOffices, (list, { slot, patch }: { slot: number; patch: Partial<Omit<Office, 'slot'>> }) =>
    list.map((o) => (o.slot === slot ? { ...o, ...patch } : o)));
  const voice = useVoice();
  const device = useDevice();
  const isPhone = device === 'phone';
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    // "Enter office" clicked on the dashboard shown on the monitor: we are already there, so just stand up.
    if (isEmbedded()) { setEmbedded(true); window.parent.postMessage({ type: 'gc-leave-monitor' }, window.location.origin); return; }
    const h = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === 'gc-leave-monitor' && officeUi.get().seatId) act(); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  // Never run a second office inside the dashboard iframe (it would join the mesh as this user).
  const labelTexts = useMemo(() => ({ locale, older: t('olderMessage'), newer: t('newerMessage'), receptionist: t('receptionist') }), [locale, t]);
  // The meeting running in the conference room (one left with nobody in it for a while counts as over).
  const [slowNow, setSlowNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setSlowNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  const running = meetingData.meeting && meetingEnd(meetingData.meeting, meetingData.attendance, slowNow) === null ? meetingData.meeting : null;
  // The conference screen shows the running meeting's name and purpose instead of the general meeting page.
  const [runTitle, runPurpose, runStart] = [running?.title, running?.purpose, running?.startedAt];
  const meetingLabels = useMemo(() => ({
    title: runTitle ?? t('meeting.title'), subtitle: runPurpose ?? t('meeting.subtitle'), raiseHand: t('meeting.raiseHand'), shareIdea: t('meeting.shareIdea'),
    shareImage: t('meeting.shareImage'), shareScreen: t('meeting.shareScreen'), more: t('meeting.more'), hands: t('meeting.hands'), rtl: locale === 'fa',
    startedAt: runStart,
  }), [locale, t, runTitle, runPurpose, runStart]);
  const roomLabels = useMemo(() => ({
    cafe: t('cafe'), library: t('library'), game: t('game'), garden: t('garden'), quiet: t('quiet'),
    arcadeTitle: t('arcade.title'), arcadePress: isPhone ? t('arcade.tap') : t('arcade.press'), scores: t('arcade.scores'), noScores: t('arcade.noScores'), xoTitle: t('xo.title'), rtl: locale === 'fa',
  }), [locale, t, isPhone]);
  const tabletLabels = useMemo(() => ({
    title: t('tablet.title'), idle: t('tablet.idle'), presenting: t('tablet.presenting', { name: '{name}' }),
    raiseHand: t('tablet.raiseHand'), lowerHand: t('tablet.lowerHand'), micOn: t('tablet.micOn'), micOff: t('tablet.micOff'),
    board: t('tablet.board'), present: t('tablet.present'), stopPresent: t('tablet.stopPresent'), view: t('tablet.view'),
    react: t('tablet.react'), look: t('tablet.look'), lightPresent: t('tablet.lightPresent'),
    stand: t('tablet.stand'), hands: t('meeting.hands'), notes: t('tablet.notes'), meeting: t('tablet.meeting'), startMeeting: t('tablet.startMeeting'), rtl: locale === 'fa',
  }), [locale, t]);
  const mesh = useMemo(() => (embedded ? null : getMesh(user.id, device)), [embedded, user.id, device]);
  const net = useOfficeNet(mesh, user.id);
  const ui = useOfficeUi((s) => s);
  const tourStep = useTourStep();
  const [myPos, setMyPos] = useState<[number, number]>([...SPAWN.pos]);
  const [guestChat, setGuestChat] = useState(false);
  const relock = useRef(false);

  // Team chat inside the office: the panel, an unread count, a short preview of a new message while the
  // panel is closed, and the newest messages above their writers' heads (OfficeLabels).
  const team = useChat('team', messages);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [chatFocus, setChatFocus] = useState(0);
  const [preview, setPreview] = useState<Message | null>(null);
  const chatRelock = useRef(false);
  const lastTeam = team.messages.at(-1);
  useEffect(() => { if (ui.chat) setChatSeenAt(Date.now()); }, [ui.chat, lastTeam?.id]);
  const unreadChat = ui.chat ? 0 : team.messages.filter((m) => m.authorId !== user.id && !m.id.startsWith(PENDING) && Date.parse(m.createdAt) > chatSeenAt).length;
  const previewed = useRef(lastTeam?.id);
  useEffect(() => {
    if (previewed.current === lastTeam?.id) return;
    previewed.current = lastTeam?.id;
    if (lastTeam && lastTeam.authorId !== user.id && !officeUi.get().chat) setPreview(lastTeam);
  }, [lastTeam, user.id]);
  useEffect(() => { if (!preview) return; const id = setTimeout(() => setPreview(null), 5000); return () => clearTimeout(id); }, [preview]);
  const openChat = useCallback(() => {
    if (document.pointerLockElement) { chatRelock.current = true; document.exitPointerLock(); }
    officeUi.set({ chat: true, emoteWheel: false });
    setPreview(null);
    setChatFocus((n) => n + 1);
  }, []);
  const closeChat = useCallback(() => {
    officeUi.set({ chat: false });
    if (chatRelock.current && !isPhone && canLook()) canvas()?.requestPointerLock?.();
    chatRelock.current = false;
  }, [isPhone]);
  const seat = ui.seatId ? SEATS.find((s) => s.id === ui.seatId) ?? null : null;
  const working = !!seat?.monitor; // at a desk with the dashboard on the monitor
  const hands = useHands();
  const roomNow = useRoomSettings();
  // The drawing board beside the office (default) or over all of it; remembered on this device.
  const [split, setSplitState] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(SPLIT_KEY) === '0') setSplitState(false); } catch { /* storage blocked */ } }, []);
  const setSplit = useCallback((on: boolean) => {
    setSplitState(on);
    try { localStorage.setItem(SPLIT_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    if (on && officeUi.get().inConference) input.lookAt = SCREEN_CENTER;
  }, []);
  const boardSplit = ui.board !== 'none' && split;

  // The desk dashboard loads in the background once the office had time to load, so sitting down is instant.
  const [preloadMonitor, setPreloadMonitor] = useState(false);
  useEffect(() => { const id = setTimeout(() => setPreloadMonitor(true), MONITOR_PRELOAD_MS); return () => clearTimeout(id); }, []);
  useEffect(() => connectDoors(mesh), [mesh]);
  // Game room: the jukebox's style, the game table and the arcade's best scores are shared live.
  useEffect(() => connectJukebox(mesh), [mesh]);
  useEffect(() => connectXo(mesh), [mesh]);
  useEffect(() => connectScores(mesh, user.id), [mesh, user.id]);
  // The music follows where I stand (louder in the game room, silent far away).
  useEffect(() => { jukebox.listen(myPos); }, [myPos]);
  useEffect(() => () => jukebox.listen(null), []);
  // Conference room light and glass: live from the others over WebRTC, the saved value from the page data.
  useEffect(() => connectRoomControls(mesh), [mesh]);
  useEffect(() => { if (room) roomControls.load(room); }, [room]);
  // The wall panel's controls close when you leave the room.
  useEffect(() => { if (!ui.inConference) officeUi.set({ roomPanel: false }); }, [ui.inConference]);
  // A raised hand comes down when you get up from the conference table.
  const atConfSeat = !!ui.seatId?.startsWith('conf-');
  useEffect(() => { if (!atConfSeat) raiseHand(false); }, [atConfSeat]);
  useEffect(() => () => raiseHand(false), []);
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
      net.remotes.current.set(userId, { userId, pose: { x, z, yaw, pitch: 0, moving, seatId, t: Date.now() }, receivedAt: performance.now() + 6e7, emote: emote ? { id: emote as never, until: Date.now() + 6e7 } : null, typing: 0 });
    };
    (window as unknown as { __gcTyping?: unknown }).__gcTyping = (userId: string, on = true) => {
      const r = net.remotes.current.get(userId);
      if (r) r.typing = on ? Date.now() + 6e7 : 0;
    };
  }, [net]);
  useEffect(() => {
    if (!ui.myEmote) return;
    const id = setTimeout(() => officeUi.set({ myEmote: null }), Math.max(0, ui.myEmote.until - Date.now()));
    return () => clearTimeout(id);
  }, [ui.myEmote]);
  useEffect(() => () => officeUi.set({ seatId: null, panel: 'none', emoteWheel: false, interact: null, roomPanel: false, board: 'none', chat: false, overlay: 'none', used: null }), []);
  // The coffee machine: a cup, its sound and a short note for everyone around.
  const [toast, setToast] = useState<string | null>(null);
  const { sendEmote: sendEmoteNow, sendPose: sendPoseNow } = net; // stable callbacks (the `net` object itself is new on every render)
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id); }, [toast]);
  const usedAt = ui.used?.at;
  useEffect(() => {
    if (!usedAt || officeUi.get().used?.station !== 'coffee') return;
    music().blip([55, 57, 59, 72], 'triangle', 0.12, 0.16);
    sendEmoteNow('coffee');
    setToast(t('coffeeReady'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedAt]);
  // Dancing: stepping onto the lit floor while music plays.
  const dancing = ui.area === 'game' && !ui.seatId && onDance(myPos) && jukebox.playing();
  useEffect(() => {
    if (!dancing) return;
    sendEmoteNow('dance');
    const id = setInterval(() => sendEmoteNow('dance'), 3800);
    return () => clearInterval(id);
  }, [dancing, sendEmoteNow]);
  const [more, setMore] = useState(false);
  const focusTimer = useFocusTimer();
  const closeOverlay = useCallback(() => {
    officeUi.set({ overlay: 'none' });
    if (!isPhone && canLook()) canvas()?.requestPointerLock?.();
  }, [isPhone]);
  const openMap = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    officeUi.set({ overlay: officeUi.get().overlay === 'map' ? 'none' : 'map', emoteWheel: false, roomPanel: false });
    setMore(false);
  }, []);
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
      if (officeUi.get().board !== 'none' || officeUi.get().overlay === 'arcade') return;
      // Tab switches between mouse look and the on-screen cursor (computers).
      if (e.code === 'Tab' && !isPhone) {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        else if (canLook()) canvas()?.requestPointerLock?.();
        return;
      }
      // Enter or T opens the team chat (Enter belongs to the tour while it runs).
      if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyT') && !e.repeat && !working && tour.get().step === null) {
        e.preventDefault();
        openChat();
        return;
      }
      if (e.code === 'KeyQ' && !e.repeat && !working) openWheel(!officeUi.get().emoteWheel);
      if (e.code === 'KeyM' && !e.repeat) voice.toggleMic();
      if (e.code === 'KeyN' && !e.repeat && !working && officeUi.get().overlay === 'none') { openMap(); return; }
      if (e.code === 'Escape') { officeUi.set({ emoteWheel: false, selectedUserId: null, roomPanel: false, overlay: 'none' }); setMeetingPanelState('none'); setMore(false); }
      const n = Number(e.key);
      if (officeUi.get().emoteWheel && n >= 1 && n <= 9) sendEmote(EMOTES[n - 1].id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [voice, isPhone, working, openWheel, sendEmote, openChat, openMap]);

  // Record a visit when entering someone else's office.
  useEffect(() => {
    if (!ui.currentSlot) return;
    const o = offices.find((x) => x.slot === ui.currentSlot);
    if (o?.ownerId && o.ownerId !== user.id) void recordVisitAction(ui.currentSlot);
  }, [ui.currentSlot, offices, user.id]);

  const lastPose = useRef<Parameters<typeof net.sendPose>[0] | null>(null);
  const onPose = useCallback((p: Parameters<typeof net.sendPose>[0]) => {
    lastPose.current = p;
    net.sendPose(p);
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
    if (mySlot !== undefined) {
      applyOffice({ slot: mySlot, patch });
      // Locking the office or frosting its glass shuts its door for everyone.
      if (patch.locked === true || patch.glass === 'frosted') setDoor(`o${mySlot}`, false);
    }
    return updateMyOfficeAction(patch);
  }, [mySlot, applyOffice]);

  // "Claim this office" in an empty office. Someone who already has an office confirms the move first.
  const [claim, setClaim] = useState<'idle' | 'confirm' | 'saving' | 'failed' | 'taken' | 'done'>('idle');
  const [, startClaim] = useTransition();
  useEffect(() => { setClaim((c) => (c === 'done' ? c : 'idle')); }, [ui.currentSlot]);
  useEffect(() => { if (claim !== 'done') return; const id = setTimeout(() => setClaim('idle'), 3500); return () => clearTimeout(id); }, [claim]);
  const claimOffice = (slot: number) => {
    const previous = offices.find((o) => o.ownerId === user.id);
    if (previous && claim !== 'confirm') { setClaim('confirm'); return; }
    setClaim('saving');
    startClaim(async () => {
      applyOffice({ slot, patch: previous ? { ownerId: user.id, glass: previous.glass, locked: previous.locked, focus: previous.focus, isPublic: previous.isPublic } : { ownerId: user.id, ...OFFICE_DEFAULTS } });
      if (previous) applyOffice({ slot: previous.slot, patch: { ownerId: null, ...OFFICE_DEFAULTS } });
      const r = await claimOfficeAction(slot).catch(() => null);
      setClaim(r?.ok ? 'done' : r?.error === 'taken' ? 'taken' : 'failed');
    });
  };

  // The seat tablet: its labels, what it shows (hand, mic, presentation, light) and its button presses.
  const pressRef = useRef<(b: TabletButton) => void>(() => {});
  useEffect(() => { tablet.handle((b) => pressRef.current(b)); return () => tablet.handle(null); }, []);
  useEffect(() => tablet.set({ labels: tabletLabels }), [tabletLabels]);
  useEffect(() => tablet.set({
    hand: hands.includes(user.id), mic: voice.micOn, hands: hands.length, dimmed: roomNow.light <= 40,
    presenting: presenterId ? (presenterId === user.id ? 'me' : 'other') : null,
    presenterName: profiles.find((p) => p.id === presenterId)?.displayName ?? '',
  }), [hands, user.id, voice.micOn, roomNow.light, presenterId, profiles]);
  // The meeting's name and running time on the tablet's header (updated without re-rendering the office).
  useEffect(() => {
    if (!running) { tablet.set({ meeting: null, meetingClock: '' }); return; }
    const tick = () => tablet.set({ meeting: running.title, meetingClock: clockText(Math.max(0, Math.round((Date.now() - Date.parse(running.startedAt)) / 1000))) });
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Attendance: while a meeting runs and I am in the conference room, my tab says so on entering, every
  // couple of minutes, and on leaving (also when the tab is hidden, e.g. a phone put away).
  const runningId = running?.id ?? null;
  useEffect(() => {
    if (!runningId || !ui.inConference || embedded) return;
    let here = false;
    const say = (v: boolean) => { if (v === here && !v) return; here = v; void meetingPresenceAction(runningId, v).catch(() => {}); };
    const visible = () => document.visibilityState === 'visible';
    say(visible());
    const beat = setInterval(() => { if (visible()) say(true); }, HEARTBEAT_MS);
    const onVis = () => say(visible());
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(beat); document.removeEventListener('visibilitychange', onVis); say(false); };
  }, [runningId, ui.inConference, embedded]);
  // The meeting panel (start, details, notes) closes when leaving the room.
  const [meetingPanel, setMeetingPanelState] = useState<MeetingPanelMode>('none');
  const setMeetingPanel = useCallback((m: MeetingPanelMode) => {
    if (m !== 'none' && document.pointerLockElement) document.exitPointerLock();
    setMeetingPanelState(m);
  }, []);
  useEffect(() => { if (!ui.inConference) setMeetingPanelState('none'); }, [ui.inConference]);
  // Members in the conference room right now (live positions), for the attendance list.
  const presentNow = useCallback(() => {
    const ids = [...net.remotes.current.values()].filter((r) => performance.now() - r.receivedAt < 5000 && inConference(r.pose.x, r.pose.z)).map((r) => r.userId);
    return officeUi.get().inConference ? [user.id, ...ids] : ids;
  }, [net, user.id]);

  // Nothing of the 3D view is visible behind the full-screen dashboard, the full-screen board or the
  // arcade game: stop drawing it (the phone stays cool) and only keep telling the others we are here.
  const paused = ui.panel === 'fullscreen' || (ui.board !== 'none' && !split) || ui.overlay === 'arcade';
  useEffect(() => {
    if (!paused) return;
    const id = setInterval(() => { if (lastPose.current) sendPoseNow(lastPose.current); }, 1000);
    return () => clearInterval(id);
  }, [paused, sendPoseNow]);

  if (embedded) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-muted">{t('embedded')}</div>;
  }

  const current = offices.find((o) => o.slot === ui.currentSlot) ?? null;
  const owner = current ? profiles.find((p) => p.id === current.ownerId) : null;
  const place = current ? (owner ? t('officeOf', { name: owner.displayName }) : t('emptyOffice', { slot: current.slot })) : t(ui.area === 'office' ? 'corridor' : ui.area);
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
    if (split && ui.inConference) input.lookAt = SCREEN_CENTER;
  };
  // Buttons pressed on the seat tablet (see tablet.ts).
  const pressTablet = (b: TabletButton) => {
    switch (b) {
      case 'hand': raiseHand(!hands.includes(user.id)); break;
      case 'mic': voice.toggleMic(); break;
      case 'board': openBoard('mine'); break;
      case 'present':
        if (presenterId === user.id) present(false);
        else if (presenterId) openBoard('screen');
        else { present(true); openBoard('mine'); }
        break;
      case 'react': openWheel(true); break;
      case 'look': input.lookAt = SCREEN_CENTER; break;
      case 'lights': {
        roomControls.set(roomNow.light <= 40 ? MEETING_LIGHT : PRESENT_LIGHT);
        void saveRoomAction('conference', roomControls.get());
        break;
      }
      case 'stand': act(); break;
      case 'notes': setMeetingPanel(running ? 'notes' : 'start'); break;
      case 'meeting': setMeetingPanel(running ? 'info' : 'start'); break;
    }
  };
  pressRef.current = pressTablet;
  // Who sits on the other chair of the game table (live positions).
  const otherXoSeat = ui.seatId === 'xo-a' ? 'xo-b' : 'xo-a';
  const xoOpponent = ui.seatId?.startsWith('xo-') ? [...net.remotes.current.values()].find((r) => performance.now() - r.receivedAt < 5000 && r.pose.seatId === otherXoSeat)?.userId ?? null : null;
  const officeControls = inMyOffice && !!myOffice && !ui.seatId && !touring;
  const showCursor = !isPhone && !ui.locked && !(working && ui.panel !== 'none');
  const it = ui.interact;
  const hint = ui.seatId ? (working ? null : atTable ? t('tabletHint') : t('standHint'))
    : !it ? null
      : it.kind === 'seat' ? t('pressE')
        : it.kind === 'guide' ? t('pressTalk')
          : it.kind === 'panel' ? t('pressPanel')
          : it.kind === 'station' ? t(`use.${it.station}`)
          : !it.allowed ? t('noAccess') : it.open ? t('pressClose') : t('pressOpen');
  const action = ui.seatId ? { icon: Hand, label: t('stand') }
    : !it ? null
      : it.kind === 'seat' ? { icon: Armchair, label: t('sit') }
        : it.kind === 'guide' ? { icon: MessageSquare, label: t('talk') }
          : it.kind === 'panel' ? { icon: SlidersHorizontal, label: t('roomControls') }
          : it.kind === 'station' ? { icon: it.station === 'arcade' ? Gamepad2 : it.station === 'jukebox' ? Music : Coffee, label: t(`useShort.${it.station}`) }
          : !it.allowed ? { icon: Lock, label: t('noAccess'), disabled: true }
            : { icon: it.open ? DoorClosed : DoorOpen, label: it.open ? t('closeDoor') : t('openDoor') };

  const workBar = (
    <>
      <button type="button" className="flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm hover:bg-white/25"
        onClick={() => officeUi.set({ panel: ui.panel === 'fullscreen' ? 'monitor' : 'fullscreen' })} disabled={ui.panel === 'none'}>
        {ui.panel === 'fullscreen' ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}{ui.panel === 'fullscreen' ? t('monitor') : t('fullscreen')}
      </button>
      <button type="button" className="flex min-h-10 items-center gap-2 rounded-xl bg-[#d9443c] px-3 text-sm font-semibold hover:opacity-90" onClick={act}>
        <LogOut className="size-4 rtl:-scale-x-100" />{t('exit')}
      </button>
    </>
  );

  return (
    <div id="gc-office" className={clsx('fixed inset-0 bg-[#2a221c] text-white select-none', showCursor && 'cursor-none [&_*]:cursor-none')}>
      {/* The 3D view: all of the screen, or beside (landscape) or above (portrait) the drawing board in split view. */}
      <div className={clsx('absolute', boardSplit
        ? 'inset-x-0 top-0 h-[42dvh] landscape:inset-y-0 landscape:start-auto landscape:end-0 landscape:h-auto landscape:w-[42vw]'
        : 'inset-0')}>
        <OfficeScene user={user} profiles={profiles} offices={offices} invitedSlots={invitedSlots} lowQuality={ui.lowQuality} isPhone={isPhone}
          loadingLabel={t('loadingModels')} meetingLabels={meetingLabels} roomLabels={roomLabels} paused={paused} remotes={net.remotes} external={net.external} onPose={onPose} voiceDistance={voiceDistance} />
        {/* Names, messages and emotes above the heads, placed in the 3D world by LabelProjector */}
        <OfficeLabels profiles={profiles} messages={team.messages} remotes={net.remotes} seenAt={chatSeenAt} texts={labelTexts} />
      </div>
      {isPhone && !touring && !working && !ui.chat && ui.overlay === 'none' && <TouchControls lookOnly={!!ui.seatId} />}

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
          <div className="pointer-events-auto relative ms-auto flex gap-2">
            <LocaleSwitch dark className="max-sm:hidden" />
            <button type="button" onClick={voice.toggleMic} aria-label={t('mic')} className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', voice.micOn ? 'bg-[#22a559]' : 'bg-black/55')}>
              {voice.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
            </button>
            <button type="button" onClick={() => openWheel(!ui.emoteWheel)} aria-label={t('emotes')} className="flex size-11 items-center justify-center rounded-xl bg-black/55 backdrop-blur max-sm:hidden"><Smile className="size-5" /></button>
            <button type="button" onClick={() => (ui.chat ? closeChat() : openChat())} aria-label={tChat('title')} aria-pressed={ui.chat} title={tChat('title')}
              className={clsx('relative flex size-11 items-center justify-center rounded-xl backdrop-blur', ui.chat ? 'bg-[#2f8f7a]' : 'bg-black/55')}>
              <MessageCircle className="size-5" />
              {unreadChat > 0 && <span className="absolute -top-1 -end-1 min-w-5 rounded-full bg-[#f07a2a] px-1 text-center text-[11px] leading-5 font-bold shadow">{unreadChat > 9 ? '9+' : unreadChat}</span>}
            </button>
            <button type="button" onClick={openMap} aria-label={t('map.title')} aria-pressed={ui.overlay === 'map'} title={`${t('map.title')} (N)`}
              className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur', ui.overlay === 'map' ? 'bg-[#2f8f7a]' : 'bg-black/55')}><MapIcon className="size-5" /></button>
            <button type="button" onClick={() => officeUi.set({ lowQuality: !ui.lowQuality })} aria-label={ui.lowQuality ? t('highQuality') : t('lowQuality')} title={ui.lowQuality ? t('highQuality') : t('lowQuality')}
              className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur max-sm:hidden', ui.lowQuality ? 'bg-[#f07a2a]' : 'bg-black/55')}><Gauge className="size-5" /></button>
            {/* Phones: the less used buttons fold into one menu so the bar fits a narrow screen. */}
            <button type="button" onClick={() => setMore((x) => !x)} aria-label={tc('more')} aria-expanded={more} className={clsx('flex size-11 items-center justify-center rounded-xl backdrop-blur sm:hidden', more ? 'bg-[#2f8f7a]' : 'bg-black/55')}><MoreHorizontal className="size-5" /></button>
            {more && (
              <div className="gc-pop absolute end-0 top-[3.25rem] z-40 flex w-56 flex-col gap-1 rounded-2xl bg-black/80 p-2 text-sm shadow-xl backdrop-blur sm:hidden">
                <button type="button" onClick={() => { setMore(false); openWheel(true); }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 hover:bg-white/15"><Smile className="size-5" />{t('emotes')}</button>
                <button type="button" onClick={() => { officeUi.set({ lowQuality: !ui.lowQuality }); setMore(false); }} className="flex min-h-11 items-center gap-3 rounded-xl px-3 hover:bg-white/15"><Gauge className={clsx('size-5', ui.lowQuality && 'text-[#f07a2a]')} />{ui.lowQuality ? t('highQuality') : t('lowQuality')}</button>
                <div className="flex min-h-11 items-center px-1"><LocaleSwitch dark /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crosshair and hints */}
      {ui.locked && !working && <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}
      {!working && !touring && ui.board === 'none' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] short:p-2">
          {!isPhone && !ui.locked && <div className="rounded-xl bg-black/60 px-4 py-2 text-sm">{ui.seatId ? t('cursorHint') : t('clickToLook')}</div>}
          {!isPhone && hint && <div className={clsx('rounded-xl px-4 py-2 text-sm', it?.kind === 'door' && !it.allowed ? 'bg-[#d9443c]/90' : 'bg-[#2f5d45]/90')}>{hint}</div>}
          {!isPhone && !ui.chat && <div className="hidden rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80 md:block">{t('controlsDesktop')}</div>}
          {isPhone && !ui.seatId && !ui.chat && <div className="rounded-lg bg-black/40 px-3 py-1 text-xs text-white/80 short:hidden">{t('controlsMobile')}</div>}
        </div>
      )}

      {/* Contextual action (phones; on computers it's E) */}
      {isPhone && !working && !touring && action && !ui.roomPanel && !ui.chat && (
        <div className="absolute end-4 bottom-6 z-40 pb-[env(safe-area-inset-bottom)] short:bottom-3">
          <button type="button" disabled={'disabled' in action} className="flex min-h-14 items-center gap-2 rounded-2xl bg-[#2f5d45] px-5 text-base font-semibold shadow-lg disabled:bg-[#d9443c]/90 short:min-h-12"
            onClick={act}>
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
        <div key={ui.myEmote.until} className="gc-pop pointer-events-none absolute top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border-[3px] border-[#1d4a3a] bg-[#fbf6ea] py-1 ps-2 pe-3 text-sm font-semibold text-[#1d4a3a] shadow-lg short:top-16">
          <span className="text-2xl leading-none">{EMOTES.find((e) => e.id === ui.myEmote!.id)?.emoji}</span>{te(ui.myEmote.id)}
        </div>
      )}

      {/* Team chat */}
      {ui.chat && !working && (
        <OfficeChat messages={team.messages} profiles={profiles} meId={user.id} remotes={net.remotes} onSend={team.send} onTyping={net.sendTyping} onClose={closeChat}
          focusKey={isPhone ? 0 : chatFocus} />
      )}
      {preview && !ui.chat && !working && !touring && !ui.roomPanel && (
        <button type="button" onClick={openChat}
          className="gc-pop absolute top-[4.25rem] end-3 z-30 flex max-w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2 rounded-2xl bg-black/65 py-1.5 ps-1.5 pe-3 text-start shadow-lg backdrop-blur short:top-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/models/thumbs/${profiles.find((p) => p.id === preview.authorId)?.characterId ?? 'kaykit-mage'}.webp`} alt="" className="size-8 shrink-0 rounded-full bg-[#f6e3cf] object-cover" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-[#ffd98a]">{profiles.find((p) => p.id === preview.authorId)?.displayName ?? '—'}</span>
            <span dir="auto" className="block truncate text-sm">{preview.body || '📎'}</span>
          </span>
        </button>
      )}

      {/* Empty office: anyone inside can take it */}
      {current && !current.ownerId && !ui.seatId && !touring && !working && (
        <div className="absolute top-[4.25rem] left-1/2 z-30 flex w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col items-center gap-2 short:top-14">
          {claim === 'confirm' && myOffice ? (
            <div className="w-full rounded-2xl bg-black/75 p-3 text-sm shadow-xl backdrop-blur">
              <p className="mb-3 leading-6">{t('claimMove', { slot: myOffice.slot })}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setClaim('idle')} className="min-h-11 rounded-xl bg-white/15 px-4 hover:bg-white/25">{tc('cancel')}</button>
                <button type="button" onClick={() => claimOffice(current.slot)} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f6c544] px-4 font-semibold text-[#1d3a2e]"><KeyRound className="size-4" />{t('claimMoveConfirm')}</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={claim === 'saving'} onClick={() => claimOffice(current.slot)}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-[#f6c544] px-5 text-base font-bold text-[#1d3a2e] shadow-lg ring-2 ring-[#fff3c4]/70 transition active:scale-95 disabled:opacity-70">
              <KeyRound className="size-5" />{claim === 'saving' ? tc('saving') : t('claim')}
            </button>
          )}
          {claim === 'taken' && <p className="rounded-lg bg-[#d9443c]/90 px-3 py-1 text-xs" role="alert">{t('claimTaken')}</p>}
          {claim === 'failed' && <p className="rounded-lg bg-[#d9443c]/90 px-3 py-1 text-xs" role="alert">{t('saveFailed')}</p>}
        </div>
      )}
      {claim === 'done' && inMyOffice && !working && (
        <div className="gc-pop pointer-events-none absolute top-[4.25rem] left-1/2 z-30 -translate-x-1/2 rounded-2xl bg-[#2f5d45] px-4 py-2 text-sm font-semibold shadow-lg short:top-14">{t('claimed')}</div>
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
      {!touring && ui.board === 'none' && ui.inConference && (
        <div className="absolute top-[4.25rem] left-1/2 z-30 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap justify-center gap-2 short:top-14">
          <MeetingPanel data={meetingData} running={running} mode={meetingPanel} onMode={setMeetingPanel} presentNow={presentNow} />
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
      {ui.board !== 'none' && <BoardApp watch={ui.board === 'screen'} split={split} onSplit={setSplit} onClose={() => officeUi.set({ board: 'none' })} />}

      {/* Game room, library pod and the map */}
      {ui.overlay === 'arcade' && <ArcadeGame people={profiles.map((p) => ({ id: p.id, name: p.displayName }))} meId={user.id} onClose={closeOverlay} />}
      {ui.overlay === 'jukebox' && !ui.seatId && (
        <div className="absolute top-[4.25rem] end-3 z-30 short:top-14"><JukeboxPanel onClose={closeOverlay} /></div>
      )}
      {ui.overlay === 'map' && (
        <MiniMap profiles={profiles} offices={offices} meId={user.id} myPos={myPos} remotes={net.remotes} mesh={mesh} onClose={closeOverlay}
          onGo={(p) => { input.teleport = p; invalidate(); }} />
      )}
      {!touring && ui.board === 'none' && ui.overlay === 'none' && !ui.chat && (ui.seatId?.startsWith('xo-') || ui.seatId?.startsWith('pod-')) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 flex justify-center px-3 short:bottom-12 short:justify-end">
          {ui.seatId.startsWith('xo-')
            ? <XoPanel mark={ui.seatId === 'xo-a' ? 1 : 2} alone={!xoOpponent} opponent={profiles.find((p) => p.id === xoOpponent)?.displayName ?? null} />
            : <FocusTimer />}
        </div>
      )}
      {/* A running focus timer stays in sight after leaving the pod */}
      {focusTimer.running && !ui.seatId?.startsWith('pod-') && !working && (
        <div className="pointer-events-none absolute start-3 top-[4.25rem] z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums backdrop-blur short:top-14" dir="ltr"><Timer className="size-3.5 text-[#8fe0c8]" />{clock(focusTimer.leftMs)}</div>
      )}
      {toast && <div className="gc-pop pointer-events-none absolute top-24 left-1/2 z-40 -translate-x-1/2 rounded-2xl bg-[#2f5d45] px-4 py-2 text-sm font-semibold shadow-lg short:top-16">{toast}</div>}

      <Tutorial markDone={!user.tutorialDone} />
      {showCursor && <TabCursor />}
    </div>
  );
}
