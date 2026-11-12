'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';
import { applyOp, cleanItem, cleanOp, inverseOps, mayEdit, MAX_ITEMS, MAX_PAGES, BOARD_H, BOARD_W, type BoardItem, type BoardOp } from './model';

// Live boards over the WebRTC mesh (nothing goes to the database). Each member draws on their own
// board; every change is sent to all tabs, so the member's other devices (draw on the phone while the
// computer is in the office) and, while they present, everyone's conference screen follow at once.
// One presenter at a time: the first claim wins a race; the presenter (or their leaving) ends it.
// While presenting, the presenter may let everyone draw on their board: others add their own items
// (each item records its author) and may change or erase only those. The presenter also turns the
// pages, which everyone follows, and can run a countdown shown on the screen.
// A member's own board is kept in this browser (localStorage) between visits.
// Traffic stays small as boards fill up: a board's changes go only to the tabs that show it (the owner's
// other devices, and everyone while it is on the screen); a stroke being drawn sends only its new points;
// a whole board (snapshot) goes once to each newly connected tab, in a few large messages; and live
// updates wait while a channel is still busy instead of queueing behind each other.

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
// When each item last changed (performance.now): items still changing are drawn over a cached picture
// of the rest (see BoardPainter), so a full board does not get slower to update.
const touched = new Map<string, number>();
export const HOT_MS = 700;
/** Whether an item changed in the last moment (it is probably still being drawn or moved). */
export const isHot = (id: string) => performance.now() - (touched.get(id) ?? -1e9) < HOT_MS;
// Tabs that were sent my board, with the opening of the channel they got it on (see Mesh.eventsLink).
const synced = new Map<string, number>();
const emit = () => listeners.forEach((l) => l());
// Changes from the network are shown at most once a frame (a snapshot is many messages at once).
let emitQueued = false;
function emitSoon() {
  if (emitQueued) return;
  emitQueued = true;
  const run = () => { if (!emitQueued) return; emitQueued = false; emit(); };
  requestAnimationFrame(run);
  setTimeout(run, 150); // hidden tabs get no animation frames
}
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

// Saved a moment after the last change, when the browser is idle (a full board is a large text).
let saveTimer: number | undefined;
function save() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const write = () => { try { if (me) localStorage.setItem(STORAGE, JSON.stringify(boards.get(me) ?? EMPTY)); } catch { /* storage full or blocked */ } };
    if ('requestIdleCallback' in window) requestIdleCallback(write, { timeout: 2000 }); else write();
  }, 1000);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (saveTimer !== undefined && me) { window.clearTimeout(saveTimer); try { localStorage.setItem(STORAGE, JSON.stringify(boards.get(me) ?? EMPTY)); } catch { /* ignore */ } } });

const boardOf = (userId: string) => boards.get(userId) ?? EMPTY;
const shared = (owner: string) => presenter.userId === owner && presenter.shared;
// Who needs the changes of a board: everyone while it is on the screen, otherwise only its owner's other tabs.
const audience = (owner: string) => (presenter.userId === owner ? undefined : (p: PeerInfo) => p.userId === owner);
/** Bytes above which live updates of a stroke or a drag wait for the channel to drain. */
const BUSY_BYTES = 48 * 1024;
/** The link to the tabs showing `owner`'s board is still sending earlier changes (skip a live update). */
export const boardBusy = (owner = me) => !!owner && (mesh?.eventBacklog(audience(owner)) ?? 0) > BUSY_BYTES;
const stackOf = (owner: string) => {
  let s = stacks.get(owner);
  if (!s) stacks.set(owner, (s = { undo: [], redo: [] }));
  return s;
};

function applyTo(userId: string, op: BoardOp, at: number) {
  const b = boardOf(userId);
  if (op.t === 'put' || op.t === 'pts') {
    touched.set(op.t === 'put' ? op.item.id : op.id, performance.now());
    if (touched.size > 3000) { const old = performance.now() - HOT_MS; for (const [id, t] of touched) if (t < old) touched.delete(id); }
  }
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
  mesh?.sendEvent({ type: 'board', u: owner, op, at }, audience(owner));
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
  mesh?.sendEvent({ type: 'board-page', u: me, page: nb.page, pages: nb.pages, at }, audience(me));
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
const sendPresenter = (to?: (p: PeerInfo) => boolean) => mesh?.sendEvent({ type: 'present', u: presenter.userId, t: presenter.t, shared: presenter.shared, timer: presenter.timerEnd }, to);

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

// Whole board to some tabs: a start marker (receivers replace the board if this one is newer), then its
// items in batches of about 32 kB (fewer, larger messages than one per item).
const BATCH_BYTES = 32 * 1024;
function sendBoard(to?: (p: PeerInfo) => boolean) {
  if (!me || !mesh) return;
  const b = boardOf(me);
  mesh.sendEvent({ type: 'board-snap', u: me, at: b.at, n: b.items.length, page: b.page, pages: b.pages }, to);
  let batch: BoardItem[] = [], bytes = 0;
  const flush = () => { if (batch.length) mesh?.sendEvent({ type: 'board-batch', u: me, items: batch, at: b.at }, to); batch = []; bytes = 0; };
  for (const item of b.items) {
    const n = item.kind === 'stroke' ? item.points.length * 5 + 120 : 200;
    if (bytes + n > BATCH_BYTES) flush();
    batch.push(item); bytes += n;
  }
  flush();
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
    emitSoon();
  } else if (msg.type === 'board-batch' && u && u === from.userId && Array.isArray(msg.items)) {
    // Part of a snapshot: only the board's owner sends one.
    if (u === me && rejected.has(from.tabId)) return;
    const at = typeof msg.at === 'number' ? msg.at : 0;
    const b = boardOf(u);
    let items = b.items;
    for (const raw of msg.items.slice(0, MAX_ITEMS)) { const item = cleanItem(raw); if (item) items = applyOp(items, { t: 'put', item }); }
    boards.set(u, { ...b, items, at: Math.max(b.at, at) });
    if (u === me) save();
    emitSoon();
  } else if (msg.type === 'board-snap' && u && u === from.userId) {
    const at = typeof msg.at === 'number' ? msg.at : 0;
    const mine = boards.get(u);
    // Another device of mine with an older board gets mine back; one with the same board (same last change)
    // needs nothing (answering it too made the two devices send their boards back and forth forever,
    // filling the link more with every reconnect). Others always take the presenter's.
    if (u === me && mine && mine.at >= at) {
      rejected.add(from.tabId);
      if (mine.at > at) sendBoard((p) => p.tabId === from.tabId);
      return;
    }
    rejected.delete(from.tabId);
    const pages = pageNum(msg.pages, MAX_PAGES) || 1;
    boards.set(u, { items: [], at, pages, page: Math.min(pageNum(msg.page), pages - 1) });
    emitSoon();
  } else if (msg.type === 'board-page' && u && u === from.userId) {
    const b = boardOf(u);
    const pages = pageNum(msg.pages, MAX_PAGES) || 1;
    boards.set(u, { ...b, pages, page: Math.min(pageNum(msg.page), pages - 1), at: Math.max(b.at, typeof msg.at === 'number' ? msg.at : 0) });
    if (u === me) save();
    emitSoon();
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

// A snapshot of my board goes once to each tab that needs it, when its channel (re)opens: my other
// devices always, everyone while I present. Re-sending whole boards on every change of the people list
// used to flood the links (and delay live drawing) as boards filled up.

function onPeers(peers: PeerInfo[]) {
  if (!me || !mesh) return;
  const m = mesh;
  // The presenter left (closed every tab): the screen goes back to the meeting page.
  if (presenter.userId && presenter.userId !== me && !peers.some((p) => p.userId === presenter.userId)) setPresenter({ userId: null, t: syncedNow(), shared: true, timerEnd: null });
  const alive = new Set(peers.map((p) => p.tabId));
  for (const id of synced.keys()) if (!alive.has(id)) synced.delete(id);
  const fresh = new Set(peers.filter((p) => { const link = m.eventsLink(p.tabId); return link > 0 && synced.get(p.tabId) !== link; }).map((p) => p.tabId));
  if (!fresh.size) return;
  for (const id of fresh) synced.set(id, m.eventsLink(id));
  const isFresh = (p: PeerInfo) => fresh.has(p.tabId);
  if (presenter.userId === me) {
    sendPresenter(isFresh);
    sendBoard(isFresh);
  } else if (peers.some((p) => p.userId === me && fresh.has(p.tabId))) sendBoard((p) => p.userId === me && fresh.has(p.tabId));
}

/** Called once per page with the shared mesh; returns the disconnect. */
export function connectBoard(m: Mesh | null, userId: string) {
  if (me !== userId) { me = userId; boards.set(userId, load()); emit(); }
  mesh = m;
  synced.clear();
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
