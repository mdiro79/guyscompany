'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { applyOp, cleanItem, cleanOp, inverseOps, type BoardItem, type BoardOp } from './model';

// Live boards over the WebRTC mesh (nothing goes to the database). Each member draws on their own
// board; every change is sent to all tabs, so the member's other devices (draw on the phone while the
// computer is in the office) and, while they present, everyone's conference screen follow at once.
// One presenter at a time: the first claim wins a race; the presenter (or their leaving) ends it.
// A member's own board is kept in this browser (localStorage) between visits.

interface Board { items: BoardItem[]; at: number }
interface Presenter { userId: string | null; t: number }

const STORAGE = 'gc-board';
const boards = new Map<string, Board>();
let presenter: Presenter = { userId: null, t: 0 };
let me: string | null = null;
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
// Tabs whose (older) copy of my board I turned down: the items that follow their marker are skipped.
const rejected = new Set<string>();
const undoStack: BoardOp[][] = [];
const redoStack: BoardOp[][] = [];
const emit = () => listeners.forEach((l) => l());
const EMPTY: Board = { items: [], at: 0 };

function load(): Board {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as { items?: unknown[]; at?: number } | null;
    const items = (raw?.items ?? []).map(cleanItem).filter((i): i is BoardItem => !!i);
    return { items, at: typeof raw?.at === 'number' ? raw.at : 0 };
  } catch { return { items: [], at: 0 }; }
}

let saveTimer: number | undefined;
function save() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { if (me) localStorage.setItem(STORAGE, JSON.stringify(boards.get(me) ?? EMPTY)); } catch { /* storage full or blocked */ }
  }, 400);
}

function applyTo(userId: string, op: BoardOp, at: number) {
  const b = boards.get(userId) ?? { items: [], at: 0 };
  boards.set(userId, { items: applyOp(b.items, op), at: Math.max(b.at, at) });
}

/** Applies a change to one's own board and sends it. `record` adds it to undo (not for live stroke updates). */
export function boardOp(op: BoardOp, record = true) {
  if (!me) return;
  const before = boards.get(me)?.items ?? [];
  if (record) { undoStack.push(inverseOps(before, op)); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; }
  const at = syncedNow();
  applyTo(me, op, at);
  mesh?.sendEvent({ type: 'board', u: me, op, at });
  save();
  emit();
}

// A drag or a stroke in progress sends updates without filling the undo history; when it ends,
// one undo step is recorded against the board as it was before it started.
export function recordStep(before: BoardItem[], ops: BoardOp[]) {
  undoStack.push(ops.flatMap((op) => inverseOps(before, op)));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}

function replay(from: BoardOp[][], to: BoardOp[][]) {
  const ops = from.pop();
  if (!ops || !me) return;
  const before = boards.get(me)?.items ?? [];
  to.push(ops.flatMap((op) => inverseOps(before, op)).reverse());
  for (const op of ops) boardOp(op, false);
}
export const undo = () => replay(undoStack, redoStack);
export const redo = () => replay(redoStack, undoStack);
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function setPresenter(next: Presenter) {
  presenter = next;
  emit();
}

/** Start or stop showing one's board on the conference screen. False when someone else is presenting. */
export function present(on: boolean) {
  if (!me) return false;
  if (on && presenter.userId && presenter.userId !== me) return false;
  const msg = { userId: on ? me : null, t: syncedNow() };
  setPresenter(msg);
  mesh?.sendEvent({ type: 'present', u: msg.userId, t: msg.t });
  if (on) sendBoard();
  return true;
}

// Whole board to the others: a start marker (receivers replace the board if this one is newer), then its items.
function sendBoard(to?: string) {
  if (!me || !mesh) return;
  const b = boards.get(me) ?? EMPTY;
  mesh.sendEvent({ type: 'board-snap', u: me, at: b.at, n: b.items.length, to });
  for (const item of b.items) mesh.sendEvent({ type: 'board', u: me, op: { t: 'put', item }, at: b.at, snap: true, to });
}

function onMessage(from: PeerInfo, msg: Record<string, unknown>) {
  if (typeof msg.to === 'string' && mesh && msg.to !== mesh.self.tabId) return;
  const u = typeof msg.u === 'string' ? msg.u : null;
  // Only a member's own tabs may change their board or claim their presentation.
  if (msg.type === 'board' && u && u === from.userId) {
    const op = cleanOp(msg.op);
    const at = typeof msg.at === 'number' ? msg.at : 0;
    if (!op) return;
    if (msg.snap && rejected.has(from.tabId)) return;
    if (!msg.snap) rejected.delete(from.tabId);
    applyTo(u, op, at);
    if (u === me) save();
    emit();
  } else if (msg.type === 'board-snap' && u && u === from.userId) {
    const at = typeof msg.at === 'number' ? msg.at : 0;
    const mine = boards.get(u);
    // Another device of mine with an older board keeps mine; others always take the presenter's.
    if (u === me && mine && mine.at >= at) { rejected.add(from.tabId); sendBoard(from.tabId); return; }
    rejected.delete(from.tabId);
    boards.set(u, { items: [], at });
    emit();
  } else if (msg.type === 'present' && (u === null || u === from.userId)) {
    const t = typeof msg.t === 'number' ? msg.t : 0;
    if (u === null) { if (presenter.userId === from.userId) setPresenter({ userId: null, t }); return; }
    // Simultaneous claims: the earlier one wins.
    if (!presenter.userId || presenter.userId === u || t < presenter.t) setPresenter({ userId: u, t });
  }
}

function onPeers(peers: PeerInfo[]) {
  if (!me || !mesh) return;
  // The presenter left (closed every tab): the screen goes back to the meeting page.
  if (presenter.userId && presenter.userId !== me && !peers.some((p) => p.userId === presenter.userId)) setPresenter({ userId: null, t: syncedNow() });
  if (presenter.userId === me) {
    mesh.sendEvent({ type: 'present', u: me, t: presenter.t });
    sendBoard();
  } else if (peers.some((p) => p.userId === me)) sendBoard();
}

/** Called once per page with the shared mesh; returns the disconnect. */
export function connectBoard(m: Mesh | null, userId: string) {
  if (me !== userId) { me = userId; boards.set(userId, load()); emit(); }
  mesh = m;
  if (!m) return () => {};
  const off = m.onEvent(onMessage);
  let timer: number | undefined;
  const offPeers = m.onPeers((peers) => { window.clearTimeout(timer); timer = window.setTimeout(() => onPeers(peers), 1200); });
  return () => {
    off(); offPeers(); window.clearTimeout(timer);
    if (presenter.userId === me) present(false);
    mesh = null;
  };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const NO_ITEMS: BoardItem[] = [];

export function useBoardItems(userId: string | null) {
  return useSyncExternalStore(subscribe, () => (userId ? boards.get(userId)?.items ?? NO_ITEMS : NO_ITEMS), () => NO_ITEMS);
}
export function usePresenter() {
  return useSyncExternalStore(subscribe, () => presenter.userId, () => null);
}
export const boardItems = (userId: string) => boards.get(userId)?.items ?? NO_ITEMS;
export const subscribeBoards = subscribe;
export const presenterId = () => presenter.userId;
