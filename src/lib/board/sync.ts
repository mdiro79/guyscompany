'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { applyOp, cleanItem, cleanOp, inverseOps, mayEdit, MAX_PAGES, BOARD_H, BOARD_W, type BoardItem, type BoardOp } from './model';

// Live boards over the WebRTC mesh (nothing goes to the database). Each member draws on their own
// board; every change is sent to all tabs, so the member's other devices (draw on the phone while the
// computer is in the office) and, while they present, everyone's conference screen follow at once.
// One presenter at a time: the first claim wins a race; the presenter (or their leaving) ends it.
// While presenting, the presenter may let everyone draw on their board: others add their own items
// (each item records its author) and may change or erase only those. The presenter also turns the
// pages, which everyone follows, and can run a countdown shown on the screen.
// A member's own board is kept in this browser (localStorage) between visits.

export interface Board { items: BoardItem[]; at: number; page: number; pages: number }
export interface Presenter { userId: string | null; t: number; shared: boolean; timerEnd: number | null }
/** A laser pointer on someone's board: who points, where (board units), when it last moved (performance.now). */
export interface Laser { by: string; owner: string; x: number; y: number; at: number }

const STORAGE = 'gc-board';
export const LASER_MS = 1500;
const LASER_SEND_MS = 40;
/** How long after their last change someone counts as writing right now. */
export const WRITING_MS = 2500;

const boards = new Map<string, Board>();
let presenter: Presenter = { userId: null, t: 0, shared: true, timerEnd: null };
let me: string | null = null;
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
const laserListeners = new Set<() => void>();
// Tabs whose (older) copy of my board I turned down: the items that follow their marker are skipped.
const rejected = new Set<string>();
// Undo and redo per board (one's own, or the presenter's while drawing on it).
const stacks = new Map<string, { undo: BoardOp[][]; redo: BoardOp[][] }>();
const lasers = new Map<string, Laser>();
// When each member last changed a board (performance.now), for the "writing now" name tags.
const activity = new Map<string, number>();
const emit = () => listeners.forEach((l) => l());
const emitLasers = () => laserListeners.forEach((l) => l());
const EMPTY: Board = { items: [], at: 0, page: 0, pages: 1 };
const pageNum = (v: unknown, hi = MAX_PAGES - 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.round(v))) : 0);

function load(): Board {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as { items?: unknown[]; at?: number; page?: number; pages?: number } | null;
    const items = (raw?.items ?? []).map(cleanItem).filter((i): i is BoardItem => !!i);
    const pages = pageNum(raw?.pages, MAX_PAGES) || 1;
    return { items, at: typeof raw?.at === 'number' ? raw.at : 0, page: Math.min(pageNum(raw?.page), pages - 1), pages };
  } catch { return { ...EMPTY }; }
}

let saveTimer: number | undefined;
function save() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { if (me) localStorage.setItem(STORAGE, JSON.stringify(boards.get(me) ?? EMPTY)); } catch { /* storage full or blocked */ }
  }, 400);
}

const boardOf = (userId: string) => boards.get(userId) ?? EMPTY;
const shared = (owner: string) => presenter.userId === owner && presenter.shared;
const stackOf = (owner: string) => {
  let s = stacks.get(owner);
  if (!s) stacks.set(owner, (s = { undo: [], redo: [] }));
  return s;
};

function applyTo(userId: string, op: BoardOp, at: number) {
  const b = boardOf(userId);
  const pages = op.t === 'delpage' ? Math.max(1, b.pages - 1) : b.pages;
  boards.set(userId, { ...b, items: applyOp(b.items, op), at: Math.max(b.at, at), pages, page: Math.min(b.page, pages - 1) });
}

/**
 * Applies a change to a board and sends it: one's own, or (`owner`) the presenter's while they let
 * everyone draw. `record` adds it to undo (not for live stroke updates). False when not allowed.
 */
export function boardOp(op: BoardOp, record = true, owner = me) {
  if (!me || !owner) return false;
  const before = boardOf(owner).items;
  if (owner !== me && !mayEdit(before, op, me, owner, shared(owner))) return false;
  if (record) {
    const s = stackOf(owner);
    s.undo.push(inverseOps(before, op)); if (s.undo.length > 80) s.undo.shift(); s.redo.length = 0;
  }
  const at = syncedNow();
  applyTo(owner, op, at);
  mesh?.sendEvent({ type: 'board', u: owner, op, at });
  if (owner === me) save();
  activity.set(me, performance.now());
  emit();
  return true;
}

// A drag or a stroke in progress sends updates without filling the undo history; when it ends,
// one undo step is recorded against the board as it was before it started.
export function recordStep(before: BoardItem[], ops: BoardOp[], owner = me) {
  if (!owner) return;
  const s = stackOf(owner);
  s.undo.push(ops.flatMap((op) => inverseOps(before, op)));
  if (s.undo.length > 80) s.undo.shift();
  s.redo.length = 0;
}

function replay(owner: string | null, from: 'undo' | 'redo') {
  if (!me || !owner) return;
  const s = stackOf(owner);
  const ops = s[from].pop();
  if (!ops) return;
  const before = boardOf(owner).items;
  s[from === 'undo' ? 'redo' : 'undo'].push(ops.flatMap((op) => inverseOps(before, op)).reverse());
  for (const op of ops) boardOp(op, false, owner);
}
export const undo = (owner = me) => replay(owner, 'undo');
export const redo = (owner = me) => replay(owner, 'redo');
export const canUndo = (owner = me) => !!owner && (stacks.get(owner)?.undo.length ?? 0) > 0;
export const canRedo = (owner = me) => !!owner && (stacks.get(owner)?.redo.length ?? 0) > 0;

// Pages of one's own board: the current page travels to the others, who follow it (screen, viewers).
function setPages(page: number, pages: number) {
  if (!me) return;
  const b = boardOf(me);
  pages = Math.max(1, Math.min(MAX_PAGES, pages));
  const at = syncedNow();
  boards.set(me, { ...b, page: Math.max(0, Math.min(pages - 1, page)), pages, at: Math.max(b.at, at) });
  const nb = boardOf(me);
  mesh?.sendEvent({ type: 'board-page', u: me, page: nb.page, pages: nb.pages, at });
  save();
  emit();
}
export const goToPage = (page: number) => { if (me) setPages(page, boardOf(me).pages); };
/** Moves the items of later pages up one page so the new page right after the current one is empty. */
export function insertPage() {
  if (!me) return;
  const b = boardOf(me);
  if (b.pages >= MAX_PAGES) return;
  for (const i of b.items) if ((i.pg ?? 0) > b.page) boardOp({ t: 'put', item: { ...i, pg: (i.pg ?? 0) + 1 } }, false);
  setPages(b.page + 1, b.pages + 1);
}
export function deletePage() {
  if (!me) return;
  const b = boardOf(me);
  if (b.pages <= 1) { boardOp({ t: 'clear', pg: 0 }); return; }
  boardOp({ t: 'delpage', pg: b.page }, false);
  stacks.delete(me);
  setPages(Math.min(b.page, b.pages - 2), b.pages - 1);
}

function setPresenter(next: Presenter) {
  presenter = next;
  emit();
}
const sendPresenter = () => mesh?.sendEvent({ type: 'present', u: presenter.userId, t: presenter.t, shared: presenter.shared, timer: presenter.timerEnd });

/** Start or stop showing one's board on the conference screen. False when someone else is presenting. */
export function present(on: boolean) {
  if (!me) return false;
  if (on && presenter.userId && presenter.userId !== me) return false;
  if (!on && presenter.userId !== me) return true;
  setPresenter({ userId: on ? me : null, t: syncedNow(), shared: on ? presenter.shared : true, timerEnd: null });
  sendPresenter();
  if (on) sendBoard();
  return true;
}
/** The presenter lets everyone draw on the shared board, or only themself. */
export function shareDrawing(on: boolean) {
  if (!me || presenter.userId !== me) return;
  setPresenter({ ...presenter, shared: on });
  sendPresenter();
}
/** The presenter starts a countdown of `minutes` on the screen, or stops it (null). */
export function setTimer(minutes: number | null) {
  if (!me || presenter.userId !== me) return;
  setPresenter({ ...presenter, timerEnd: minutes ? syncedNow() + minutes * 60_000 : null });
  sendPresenter();
}

let laserSent = 0;
let laserPending: ReturnType<typeof setTimeout> | null = null;
let laserLast: { owner: string; x: number; y: number } | null = null;
/** Moves (or with null hides) one's laser pointer on `owner`'s board; sent a few times a second. */
export function pointLaser(owner: string, at: [number, number] | null) {
  if (!me || (owner !== me && !shared(owner))) return;
  if (!at) {
    lasers.delete(me); laserLast = null; emitLasers();
    if (laserPending) { clearTimeout(laserPending); laserPending = null; }
    mesh?.sendEvent({ type: 'laser', u: owner, off: true });
    return;
  }
  const x = Math.round(Math.max(0, Math.min(BOARD_W, at[0]))), y = Math.round(Math.max(0, Math.min(BOARD_H, at[1])));
  lasers.set(me, { by: me, owner, x, y, at: performance.now() });
  laserLast = { owner, x, y };
  emitLasers();
  const send = () => { laserPending = null; laserSent = performance.now(); if (laserLast) mesh?.sendEvent({ type: 'laser', u: laserLast.owner, x: laserLast.x, y: laserLast.y }); };
  if (performance.now() - laserSent >= LASER_SEND_MS) send();
  else laserPending ??= setTimeout(send, LASER_SEND_MS);
}

// Whole board to the others: a start marker (receivers replace the board if this one is newer), then its items.
function sendBoard(to?: string) {
  if (!me || !mesh) return;
  const b = boardOf(me);
  mesh.sendEvent({ type: 'board-snap', u: me, at: b.at, n: b.items.length, page: b.page, pages: b.pages, to });
  for (const item of b.items) mesh.sendEvent({ type: 'board', u: me, op: { t: 'put', item }, at: b.at, snap: true, to });
}

function onMessage(from: PeerInfo, msg: Record<string, unknown>) {
  if (typeof msg.to === 'string' && mesh && msg.to !== mesh.self.tabId) return;
  const u = typeof msg.u === 'string' ? msg.u : null;
  // A member's own tabs may change their board or claim their presentation; others only draw on a shared board.
  if (msg.type === 'board' && u) {
    const op = cleanOp(msg.op);
    const at = typeof msg.at === 'number' ? msg.at : 0;
    if (!op) return;
    if (u !== from.userId) {
      if (msg.snap || !mayEdit(boardOf(u).items, op, from.userId, u, shared(u))) return;
    } else {
      if (msg.snap && rejected.has(from.tabId)) return;
      if (!msg.snap) rejected.delete(from.tabId);
    }
    applyTo(u, op, at);
    if (!msg.snap) activity.set(from.userId, performance.now());
    if (u === me) save();
    emit();
  } else if (msg.type === 'board-snap' && u && u === from.userId) {
    const at = typeof msg.at === 'number' ? msg.at : 0;
    const mine = boards.get(u);
    // Another device of mine with an older board keeps mine; others always take the presenter's.
    if (u === me && mine && mine.at >= at) { rejected.add(from.tabId); sendBoard(from.tabId); return; }
    rejected.delete(from.tabId);
    const pages = pageNum(msg.pages, MAX_PAGES) || 1;
    boards.set(u, { items: [], at, pages, page: Math.min(pageNum(msg.page), pages - 1) });
    emit();
  } else if (msg.type === 'board-page' && u && u === from.userId) {
    const b = boardOf(u);
    const pages = pageNum(msg.pages, MAX_PAGES) || 1;
    boards.set(u, { ...b, pages, page: Math.min(pageNum(msg.page), pages - 1), at: Math.max(b.at, typeof msg.at === 'number' ? msg.at : 0) });
    if (u === me) save();
    emit();
  } else if (msg.type === 'present' && (u === null || u === from.userId)) {
    const t = typeof msg.t === 'number' ? msg.t : 0;
    if (u === null) { if (presenter.userId === from.userId) setPresenter({ userId: null, t, shared: true, timerEnd: null }); return; }
    // Simultaneous claims: the earlier one wins.
    if (!presenter.userId || presenter.userId === u || t < presenter.t) {
      setPresenter({ userId: u, t, shared: msg.shared !== false, timerEnd: typeof msg.timer === 'number' ? msg.timer : null });
    }
  } else if (msg.type === 'laser' && u && (u === from.userId || shared(u))) {
    if (msg.off || typeof msg.x !== 'number' || typeof msg.y !== 'number') lasers.delete(from.userId);
    else lasers.set(from.userId, { by: from.userId, owner: u, x: Math.max(0, Math.min(BOARD_W, msg.x)), y: Math.max(0, Math.min(BOARD_H, msg.y)), at: performance.now() });
    emitLasers();
  }
}

function onPeers(peers: PeerInfo[]) {
  if (!me || !mesh) return;
  // The presenter left (closed every tab): the screen goes back to the meeting page.
  if (presenter.userId && presenter.userId !== me && !peers.some((p) => p.userId === presenter.userId)) setPresenter({ userId: null, t: syncedNow(), shared: true, timerEnd: null });
  if (presenter.userId === me) {
    sendPresenter();
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

export function useBoard(userId: string | null): Board {
  return useSyncExternalStore(subscribe, () => (userId ? boardOf(userId) : EMPTY), () => EMPTY);
}
export function usePresenter() {
  return useSyncExternalStore(subscribe, () => presenter.userId, () => null);
}
export function usePresentation(): Presenter {
  return useSyncExternalStore(subscribe, () => presenter, () => presenter);
}
export const boardItems = (userId: string) => boardOf(userId).items;
export { boardOf };
export const subscribeBoards = subscribe;
export const presenterId = () => presenter.userId;
export const presentation = () => presenter;
/** Members who changed a board in the last few seconds (performance.now of their last change). */
export const writingNow = (userId: string) => performance.now() - (activity.get(userId) ?? -1e9) < WRITING_MS;

export const subscribeLasers = (l: () => void) => { laserListeners.add(l); return () => { laserListeners.delete(l); }; };
/** Laser pointers on `owner`'s board that moved recently. */
export function lasersOn(owner: string): Laser[] {
  const now = performance.now();
  return [...lasers.values()].filter((l) => l.owner === owner && now - l.at < LASER_MS);
}
