'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import {
  Pen, Highlighter, Eraser, Type, ImagePlus, Move, Undo2, Redo2, Trash2, X, Cast, MonitorUp, Loader2, Eye, Columns2, Maximize2,
  ChevronLeft, ChevronRight, FilePlus2, FileX2, Users, Lock, Timer, Hand, Crosshair,
} from 'lucide-react';
import { useShell } from '@/components/shell/ShellContext';
import { uploadFile } from '@/lib/upload';
import { BoardPainter, memberColor } from '@/lib/board/draw';
import { useKeyboardOpen } from '@/lib/viewport';
import {
  BOARD_COLORS, BOARD_H, BOARD_W, MAX_PAGES, PEN_SIZES, TEXT_SIZES, addPoint, fitImage, itemAt, mayEdit, moveItem, onPage, type BoardItem, type BoardOp,
} from '@/lib/board/model';
import {
  boardBusy, boardOf, boardOp, canRedo, canUndo, deletePage, goToPage, insertPage, isHot, lasersOn, pointLaser, present, recordStep, redo, setTimer, shareDrawing,
  subscribeLasers, undo, useBoard, usePresentation, writingNow, type Laser,
} from '@/lib/board/sync';
import { lowerHand, useHands } from '@/lib/board/hands';
import { syncedNow } from '@/lib/realtime/room';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'move' | 'laser';
const newId = () => crypto.randomUUID().slice(0, 12);
const SEND_EVERY = 50; // ms between live updates of a stroke or a drag (skipped while the link is busy)
const TIMERS = [3, 5, 10, 15];
const clock = (ms: number) => { const s = Math.ceil(Math.abs(ms) / 1000); return `${ms < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Pictures are scaled down (longest side 1600 px) before upload so the board stays quick to share.
async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  if (s === 1 && file.size < 1_500_000) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.86));
  if (!blob) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'board'}.${ext}`, { type: blob.type });
}

interface TextEdit { id: string; x: number; y: number; value: string; color: string; size: number }

// Laser pointers on the board shown here, as glowing dots that fade when they stop moving.
function LaserDots({ owner, color, box }: { owner: string; color: (id: string) => string; box: { w: number; h: number } }) {
  const [dots, setDots] = useState<(Laser & { fade: number })[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const now = performance.now();
      const list = lasersOn(owner).map((l) => ({ ...l, fade: Math.max(0, 1 - Math.max(0, now - l.at - 600) / 900) }));
      setDots((prev) => (prev.length === 0 && list.length === 0 ? prev : list));
      if (list.length) raf = requestAnimationFrame(tick);
    };
    const off = subscribeLasers(() => { if (!raf) raf = requestAnimationFrame(tick); });
    tick();
    return () => { off(); cancelAnimationFrame(raf); };
  }, [owner]);
  return (
    <>
      {dots.map((d) => (
        <span key={d.by} className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: (d.x / BOARD_W) * box.w, top: (d.y / BOARD_H) * box.h, opacity: d.fade, background: color(d.by), boxShadow: `0 0 0 4px ${color(d.by)}55, 0 0 16px 6px ${color(d.by)}88` }} />
      ))}
    </>
  );
}

/**
 * A member's drawing board, full screen or (`split`) beside the office so the room and the conference screen
 * stay in view; works with touch, pen and mouse. While someone else presents, "View screen" shows their board
 * (what the conference screen shows; `watch` opens it that way) and, if they let everyone draw, lets you write
 * on it too: everyone's name shows next to what they wrote.
 */
export function BoardApp({ onClose, watch = false, split, onSplit }: { onClose: () => void; watch?: boolean; split?: boolean; onSplit?: (on: boolean) => void }) {
  const t = useTranslations('board');
  const { user, profiles } = useShell();
  const show = usePresentation();
  const presenter = show.userId;
  const hands = useHands();
  const [watching, setWatching] = useState(watch);
  const onScreen = watching && !!presenter && presenter !== user.id; // looking at someone else's presentation
  const readOnly = onScreen && !show.shared;
  const owner = onScreen ? presenter! : user.id;
  const isOwner = owner === user.id;
  const board = useBoard(owner);
  const page = board.page;
  const items = useMemo(() => onPage(board.items, page), [board.items, page]);
  const ids = useMemo(() => profiles.map((p) => p.id), [profiles]);
  const nameOf = useCallback((id: string) => profiles.find((p) => p.id === id)?.displayName ?? null, [profiles]);
  const colorOf = useCallback((id: string) => memberColor(ids, id), [ids]);
  const presenterName = nameOf(presenter ?? '') ?? '';
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [size, setSize] = useState(1);
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const [edit, setEdit] = useState<TextEdit | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | 'color' | 'page' | 'timer'>(null);
  const kb = useKeyboardOpen();
  const [painter] = useState(() => new BoardPainter());
  const [tick, rerender] = useState(0); // bumps when a picture or a font finished loading, or a "writing now" tag expires
  const root = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The gesture in progress: the board before it (for undo), the stroke being drawn or the item being moved (`moved`: where it is now).
  // A stroke goes out once whole (`live`), then only its new points (`sentLen`: how many numbers the others have).
  const gesture = useRef<{ pointer: number; before: BoardItem[]; item: BoardItem | null; moved?: BoardItem; start: [number, number]; sent: number; erased: string[]; live?: boolean; sentLen?: number } | null>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFrame({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Largest 16:9 area that fits.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const w = Math.min(width, (height * BOARD_W) / BOARD_H);
      setBox({ w: Math.floor(w), h: Math.floor((w * BOARD_H) / BOARD_W) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Others' names next to what they wrote (one's own writing needs no tag here).
  const tags = useMemo(() => ({ owner, name: nameOf, color: colorOf, active: writingNow, skip: user.id }), [owner, nameOf, colorOf, user.id]);
  // Items still being drawn or moved (here or by others) are drawn over a cached picture of the rest.
  const paint = useCallback(() => {
    const c = canvas.current;
    if (!c || !box.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(box.w * dpr)) { c.width = Math.round(box.w * dpr); c.height = Math.round(box.h * dpr); }
    const list = draft ? [...items.filter((i) => i.id !== draft.id), draft] : items;
    const hot = (id: string) => id === draft?.id || isHot(id);
    painter.paint(c.getContext('2d')!, list, c.width / BOARD_W, () => rerender((n) => n + 1), { grid: !readOnly, tags, hot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, draft, box, readOnly, tags, tick, painter]);
  useEffect(() => { const id = requestAnimationFrame(paint); return () => cancelAnimationFrame(id); }, [paint]);
  // Web fonts load after the first paint; repaint when they are ready so text uses them.
  useEffect(() => { document.fonts?.ready.then(() => rerender((n) => n + 1), () => {}); }, []);
  // Once a second: the countdown, and "writing now" tags going back to normal.
  useEffect(() => { const id = setInterval(() => rerender((n) => n + 1), 1000); return () => clearInterval(id); }, []);

  const toBoard = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_W, ((e.clientY - r.top) / r.height) * BOARD_H];
  };
  const toScreen = (x: number, y: number) => ({ left: (x / BOARD_W) * box.w, top: (y / BOARD_H) * box.h });
  // What I may change here: everything on my board, only my own items on a shared one.
  const mine = (i: BoardItem | null) => !!i && mayEdit(board.items, { t: 'del', id: i.id }, user.id, owner, true);
  const op = (o: BoardOp, record = true) => boardOp(o, record, owner);

  const commitText = () => {
    if (!edit) return;
    const text = edit.value.trim();
    const o: BoardOp = text
      ? { t: 'put', item: { id: edit.id, kind: 'text', x: Math.round(edit.x), y: Math.round(edit.y), text, color: edit.color, size: edit.size, by: user.id, ...(page ? { pg: page } : {}) } }
      : { t: 'del', id: edit.id };
    if (text || items.some((i) => i.id === edit.id)) op(o);
    setEdit(null);
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    setMenu(null);
    if (readOnly || gesture.current || !e.isPrimary) return;
    const [x, y] = toBoard(e);
    if (tool === 'laser') { e.currentTarget.setPointerCapture(e.pointerId); pointLaser(owner, [x, y]); return; }
    if (tool === 'text') {
      if (edit) { commitText(); return; }
      const hit = itemAt(items, x, y, 4);
      if (hit?.kind === 'text' && mine(hit)) setEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text, color: hit.color, size: hit.size });
      else setEdit({ id: newId(), x, y: y - TEXT_SIZES[size] / 2, value: '', color, size: TEXT_SIZES[size] });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const before = boardOf(owner).items;
    const base = { by: user.id, ...(page ? { pg: page } : {}) };
    if (tool === 'pen' || tool === 'highlighter') {
      const item: BoardItem = { id: newId(), kind: 'stroke', color, size: PEN_SIZES[size], points: addPoint([], x, y), ...base, ...(tool === 'highlighter' ? { hl: true } : {}) };
      gesture.current = { pointer: e.pointerId, before, item, start: [x, y], sent: 0, erased: [] };
      setDraft(item);
    } else if (tool === 'eraser') {
      gesture.current = { pointer: e.pointerId, before, item: null, start: [x, y], sent: 0, erased: [] };
      erase(x, y);
    } else {
      const hit = itemAt(items, x, y);
      gesture.current = { pointer: e.pointerId, before, item: mine(hit) ? hit : null, start: [x, y], sent: 0, erased: [] };
    }
  };

  const erase = (x: number, y: number) => {
    const g = gesture.current!;
    const hit = itemAt(onPage(boardOf(owner).items, page).filter(mine), x, y, 6 + PEN_SIZES[size]);
    if (hit) { g.erased.push(hit.id); op({ t: 'del', id: hit.id }, false); }
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // The laser follows the mouse without a press, and a finger or pen while it touches.
    if (tool === 'laser' && !readOnly) { if (e.pointerType === 'mouse' || e.buttons) pointLaser(owner, toBoard(e)); return; }
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    // Every coalesced point (fast strokes on phones and pens) for smooth lines.
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    const pts = (events.length ? events : [e.nativeEvent]).map(toBoard);
    const now = performance.now();
    if ((tool === 'pen' || tool === 'highlighter') && g.item?.kind === 'stroke') {
      let points = g.item.points;
      for (const [x, y] of pts) points = addPoint(points, x, y);
      g.item = { ...g.item, points };
      setDraft(g.item);
      if (now - g.sent > SEND_EVERY && !boardBusy(owner)) {
        g.sent = now;
        const from = g.sentLen ?? 0;
        if (!g.live) { op({ t: 'put', item: g.item }, false); g.live = true; g.sentLen = points.length; }
        else if (points.length > from) { op({ t: 'pts', id: g.item.id, from, points: points.slice(from) }, false); g.sentLen = points.length; }
      }
    } else if (tool === 'eraser') {
      for (const [x, y] of pts) erase(x, y);
    } else if (tool === 'move' && g.item) {
      const [x, y] = pts[pts.length - 1];
      const orig = g.before.find((i) => i.id === g.item!.id) ?? g.item;
      const moved = moveItem(orig, x - g.start[0], y - g.start[1]);
      g.moved = moved;
      setDraft(moved);
      if (now - g.sent > SEND_EVERY && !boardBusy(owner)) { g.sent = now; op({ t: 'put', item: moved }, false); }
    }
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    gesture.current = null;
    if ((tool === 'pen' || tool === 'highlighter') && g.item) {
      op({ t: 'put', item: g.item }, false);
      recordStep(g.before, [{ t: 'put', item: g.item }], owner);
    } else if (tool === 'eraser' && g.erased.length) {
      recordStep(g.before, g.erased.map((id) => ({ t: 'del', id })), owner);
    } else if (tool === 'move' && g.moved) {
      op({ t: 'put', item: g.moved }, false);
      recordStep(g.before, [{ t: 'put', item: g.moved }], owner);
    }
    setDraft(null);
  };

  const addImage = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setError(null); setUploading(true);
    try {
      const small = await shrink(file);
      const bmp = await createImageBitmap(small).catch(() => null);
      const { w, h } = fitImage(bmp?.width ?? 800, bmp?.height ?? 600);
      const fileId = await uploadFile(small);
      op({ t: 'put', item: { id: newId(), kind: 'image', fileId, w, h, x: Math.round((BOARD_W - w) / 2), y: Math.round((BOARD_H - h) / 2), by: user.id, ...(page ? { pg: page } : {}) } });
      setTool('move');
    } catch {
      setError(t('uploadFailed'));
    } finally { setUploading(false); }
  };

  // Paste a picture straight onto the board.
  useEffect(() => {
    if (readOnly) return;
    const h = (e: ClipboardEvent) => {
      if (edit) return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); void addImage(f); }
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  });

  // Keyboard: Esc closes, Ctrl/Cmd+Z undoes, Shift (or Y) redoes; the owner turns pages with PageUp/PageDown.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (edit) return;
      if (e.key === 'Escape') { if (menu) setMenu(null); else onClose(); }
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(owner); rerender((n) => n + 1); }
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(owner); rerender((n) => n + 1); }
      if (isOwner && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); goToPage(page + (e.key === 'PageDown' ? 1 : -1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edit, onClose, readOnly, owner, isOwner, page, menu]);
  // Leaving the laser tool (or the board) hides one's pointer.
  useEffect(() => { if (tool !== 'laser') return; return () => pointLaser(owner, null); }, [tool, owner]);

  const presenting = presenter === user.id;
  const othersPresent = !!presenter && !presenting;
  const left = show.timerEnd ? show.timerEnd - syncedNow() : null;

  // Layout: the board as large as possible, the buttons in two slim bars along its edges, all inside the
  // safe area (clear of the notch and rounded corners, wherever they are as the phone turns). Bars go on
  // the sides when that leaves a bigger board (phones held sideways, side-by-side view on a wide screen),
  // otherwise above and below it (phones held upright). Colours and sizes sit in the bar when there is
  // room, else behind one colour button.
  const compact = Math.min(frame.w, frame.h) < 480;
  const BAR = compact ? 48 : 60;
  const bars = readOnly ? 1 : 2;
  const vertical = Math.min(frame.w - bars * BAR, (frame.h * BOARD_W) / BOARD_H) > Math.min(frame.w, ((frame.h - bars * BAR) * BOARD_W) / BOARD_H) + 8;
  const roomy = (vertical ? frame.h : frame.w) >= (compact ? 40 : 48) * 19;
  const wide = !vertical && !compact; // room for words next to the main buttons
  const sz = compact ? 'size-9' : 'size-11';
  const btn = clsx('relative flex shrink-0 items-center justify-center rounded-xl text-[#3b332c] transition-all hover:bg-black/5 active:scale-90 disabled:opacity-30', sz);
  const rail = clsx('flex shrink-0 items-center gap-0.5 rounded-2xl bg-white/85 p-1 shadow-lg backdrop-blur [scrollbar-width:none]',
    vertical ? 'max-h-full flex-col overflow-y-auto' : 'max-w-full overflow-x-auto');
  const sep = clsx('shrink-0 bg-black/10', vertical ? 'my-0.5 h-px w-6' : 'mx-0.5 h-6 w-px');
  // Menus open inside the board area, next to the bar they belong to.
  const menuAt = (bar: 'actions' | 'tools') => clsx('absolute z-20 flex max-w-[calc(100%-0.5rem)] flex-wrap items-center justify-center gap-1 rounded-2xl bg-white/95 p-2 shadow-xl',
    vertical ? (bar === 'tools' ? 'end-1' : 'start-1') + ' top-1/2 max-w-56 -translate-y-1/2' : (bar === 'tools' ? 'bottom-1' : 'top-1') + ' inset-x-0 mx-auto w-max');
  const toggleMenu = (m: NonNullable<typeof menu>) => { commitText(); setMenu((x) => (x === m ? null : m)); };

  const toolBtn = (k: Tool, Icon: typeof Pen, label: string) => (
    <button key={k} type="button" onClick={() => { commitText(); setTool(k); setMenu(null); }} aria-pressed={tool === k} title={label} aria-label={label}
      className={clsx(btn, tool === k && 'bg-[#2f5d45] text-white shadow hover:bg-[#2f5d45]')}>
      <Icon className="size-5" />
    </button>
  );
  const iconBtn = (Icon: typeof Pen, label: string, onClick: () => void, disabled = false, flip = true) => (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={btn}>
      <Icon className={clsx('size-5', flip && 'rtl:-scale-x-100')} />
    </button>
  );
  const colorBtn = (c: string) => (
    <button key={c} type="button" onClick={() => { setColor(c); if (tool !== 'pen' && tool !== 'highlighter' && tool !== 'text') setTool('pen'); }} aria-label={`${t('color')} ${c}`} aria-pressed={color === c}
      className={clsx('flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90', sz)}>
      <span className={clsx('block rounded-full transition-all', color === c ? 'size-7 ring-2 ring-[#2f5d45] ring-offset-2' : 'size-6')} style={{ background: c }} />
    </button>
  );
  const sizeBtn = (s: number, i: number) => (
    <button key={s} type="button" onClick={() => setSize(i)} aria-label={`${t('size')} ${i + 1}`} aria-pressed={size === i}
      className={clsx('flex shrink-0 items-center justify-center rounded-xl', size === i ? 'bg-black/10' : 'hover:bg-black/5', compact ? 'size-9' : 'size-11')}>
      <span className="block rounded-full bg-[#3b332c]" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
    </button>
  );
  const Prev = ChevronLeft, Next = ChevronRight;
  const subtitle = onScreen ? (show.shared ? t('everyoneDraws') : t('onlyPresenter', { name: presenterName }))
    : presenting ? t('youPresent') : othersPresent ? t('presenting', { name: presenterName }) : t('sameBoard');

  const actions = (
    <>
      {onSplit && iconBtn(split ? Maximize2 : Columns2, split ? t('fullView') : t('splitView'), () => onSplit(!split), false, false)}
      {othersPresent && (
        <button type="button" onClick={() => { commitText(); setWatching(!onScreen); }} aria-pressed={onScreen} title={onScreen ? t('myBoard') : t('view')} aria-label={onScreen ? t('myBoard') : t('view')}
          className={clsx(btn, onScreen && 'bg-[#2f5d45] text-white hover:bg-[#2f5d45]')}>
          {onScreen ? <Pen className="size-5" /> : <Eye className="size-5" />}
          {!onScreen && <span className="absolute top-1 end-1 size-2 animate-pulse rounded-full bg-[#ff6b5b]" />}
        </button>
      )}
      {!onScreen && (
        <button type="button" disabled={othersPresent} onClick={() => present(!presenting)} title={presenting ? t('stopPresent') : t('present')} aria-label={presenting ? t('stopPresent') : t('present')}
          className={clsx('relative flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold text-white shadow transition-all active:scale-95 disabled:opacity-40',
            presenting ? 'bg-[#d9443c]' : 'bg-[#2f5d45]', wide ? 'min-h-11 px-3 text-sm' : sz)}>
          {presenting ? <MonitorUp className="size-5" /> : <Cast className="size-5" />}
          {wide && <span>{presenting ? t('stopPresent') : t('present')}</span>}
          {presenting && <span className={clsx('size-2 animate-pulse rounded-full bg-white', !wide && 'absolute top-1 end-1')} />}
        </button>
      )}
      {presenting && (
        <button type="button" onClick={() => shareDrawing(!show.shared)} aria-pressed={show.shared} title={show.shared ? t('everyoneDrawsShort') : t('onlyMe')} aria-label={show.shared ? t('everyoneDrawsShort') : t('onlyMe')}
          className={clsx(btn, show.shared && 'bg-[#2f5d45] text-white hover:bg-[#2f5d45]')}>
          {show.shared ? <Users className="size-5" /> : <Lock className="size-5" />}
        </button>
      )}
      {presenting && (
        <button type="button" onClick={() => toggleMenu('timer')} aria-expanded={menu === 'timer'} title={t('timer')} aria-label={t('timer')}
          className={clsx(btn, 'flex-col gap-0', menu === 'timer' && 'bg-black/10')}>
          <Timer className={left !== null ? 'size-4' : 'size-5'} />
          {left !== null && <span dir="ltr" className={clsx('text-[10px] leading-3 font-semibold tabular-nums', left < 0 && 'text-[#d9443c]')}>{clock(left)}</span>}
        </button>
      )}
      {!readOnly && iconBtn(Undo2, t('undo'), () => { undo(owner); rerender((n) => n + 1); }, !canUndo(owner))}
      {!readOnly && iconBtn(Redo2, t('redo'), () => { redo(owner); rerender((n) => n + 1); }, !canRedo(owner))}
      {isOwner ? (
        <button type="button" onClick={() => toggleMenu('page')} aria-expanded={menu === 'page'} title={t('page')} aria-label={`${t('page')} ${page + 1} / ${board.pages}`}
          className={clsx(btn, 'w-auto min-w-9 px-1 text-xs font-semibold tabular-nums', menu === 'page' && 'bg-black/10')} dir="ltr">
          {page + 1}/{board.pages}
        </button>
      ) : board.pages > 1 && <span className={clsx('flex shrink-0 items-center justify-center text-xs font-semibold tabular-nums', sz)} dir="ltr">{page + 1}/{board.pages}</span>}
    </>
  );

  return (
    <div ref={root} role="dialog" aria-modal={!split} aria-label={t('title')}
      className={clsx('fixed z-[70] flex gap-1.5 bg-[#ebe5db] text-[#2b241e] select-none', vertical ? 'flex-row' : 'flex-col',
        // Padding keeps everything clear of the notch, the rounded corners and the home bar.
        'pb-[max(env(safe-area-inset-bottom),0.375rem)] pl-[max(env(safe-area-inset-left),0.375rem)] pr-[max(env(safe-area-inset-right),0.375rem)]',
        split
          // Beside the office (landscape) or under it (portrait), the office keeps the rest of the screen.
          ? 'inset-x-0 bottom-0 h-[58dvh] rounded-t-2xl pt-1.5 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] landscape:inset-y-0 landscape:start-0 landscape:end-auto landscape:h-auto landscape:w-[58vw] landscape:rounded-none landscape:pt-[max(env(safe-area-inset-top),0.375rem)] landscape:shadow-[0_0_30px_rgba(0,0,0,0.3)] landscape:ltr:pr-1.5 landscape:rtl:pl-1.5'
          : 'inset-0 pt-[max(env(safe-area-inset-top),0.375rem)]')}>
      {/* Close, presenting and pages: a bar above the board, or beside it */}
      {vertical ? (
        <div className={clsx(rail, 'my-auto')}>
          <button type="button" onClick={() => { commitText(); onClose(); }} aria-label={t('close')} title={t('close')} className={btn}><X className="size-5" /></button>
          <span className={sep} />
          {actions}
        </div>
      ) : (
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => { commitText(); onClose(); }} aria-label={t('close')} title={t('close')} className={clsx(btn, 'bg-white/80 shadow-sm hover:bg-white')}><X className="size-5" /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{onScreen ? t('viewing', { name: presenterName }) : t('title')}</div>
            {!compact && <div className="truncate text-xs text-[#6d6258]">{subtitle}</div>}
          </div>
          <div className={rail}>{actions}</div>
        </div>
      )}

      {/* The board */}
      <div ref={wrap} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onPointerLeave={(e) => { if (tool === 'laser' && e.pointerType === 'mouse') pointLaser(owner, null); }}
            className={clsx('block size-full touch-none rounded-2xl shadow-[0_8px_30px_rgba(60,40,20,0.15)] ring-1 ring-black/5',
              !readOnly && (tool === 'move' ? 'cursor-grab' : tool === 'text' ? 'cursor-text' : tool === 'laser' ? 'cursor-none' : 'cursor-crosshair'))}
            style={{ width: box.w, height: box.h }} />
          <LaserDots owner={owner} color={colorOf} box={box} />
          {items.length === 0 && !draft && !edit && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[#9a8f84]">{readOnly ? '' : t('empty')}</div>
          )}
          {edit && (
            // While a phone's keyboard is open the text box moves to the top of what is still visible.
            <div className={kb ? 'fixed top-[calc(var(--vv-top,0px)+0.5rem)] left-1/2 z-[80] w-[min(24rem,calc(100vw-1rem))] -translate-x-1/2' : 'absolute z-10 w-[min(22rem,80%)]'}
              style={kb ? undefined : { left: Math.min(toScreen(edit.x, edit.y).left, box.w * 0.2), top: Math.max(0, Math.min(toScreen(edit.x, edit.y).top, box.h - 120)) }}>
              <textarea autoFocus value={edit.value} rows={2} dir="auto" placeholder={t('textPh')}
                onChange={(e) => setEdit({ ...edit, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') setEdit(null); }}
                className="w-full resize-none rounded-xl border-2 border-[#2f5d45] bg-white/95 p-2 text-base shadow-lg outline-none" style={{ color: edit.color }} />
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={commitText} className="rounded-lg bg-[#2f5d45] px-3 py-1.5 text-sm font-semibold text-white">{t('done')}</button>
                <button type="button" onClick={() => setEdit(null)} className="rounded-lg bg-white px-3 py-1.5 text-sm">{t('cancel')}</button>
              </div>
            </div>
          )}
          {uploading && <div className="absolute inset-x-0 top-3 mx-auto flex w-max items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white"><Loader2 className="size-3.5 animate-spin" />{t('uploading')}</div>}
          {!readOnly && !split && !vertical && box.w < 520 && <div className="pointer-events-none absolute inset-x-0 -bottom-7 text-center text-[11px] text-[#9a8f84]">{t('rotate')}</div>}
          {error && <div role="alert" className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-[#d9443c] px-3 py-1.5 text-xs text-white">{error}</div>}
        </div>

        {/* Over the top of the board: whose screen this is (beside the board), the countdown and raised hands */}
        <div className="pointer-events-none absolute inset-x-0 top-1 z-10 flex flex-wrap justify-center gap-1 px-2">
          {vertical && onScreen && <span className="flex min-h-7 items-center gap-1.5 rounded-full bg-black/60 px-2.5 text-[11px] font-semibold text-white"><Eye className="size-3.5" />{t('viewing', { name: presenterName })}</span>}
          {!presenting && presenter && left !== null && (
            <span className={clsx('flex min-h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold', left < 0 ? 'bg-[#d9443c] text-white' : left < 60_000 ? 'bg-[#f08a24] text-white' : 'bg-white/90')}>
              <Timer className="size-3.5" /><span dir="ltr" className="tabular-nums">{clock(left)}</span>
            </span>
          )}
          {hands.map((id) => (
            <span key={id} className="pointer-events-auto flex min-h-7 items-center gap-1 rounded-full bg-[#5b8def] px-2.5 text-xs font-semibold text-white">
              <Hand className="size-3.5" />{nameOf(id)}
              {presenting && id !== user.id && (
                <button type="button" onClick={() => lowerHand(id)} aria-label={t('lowerHand', { name: nameOf(id) ?? '' })} title={t('lowerHand', { name: nameOf(id) ?? '' })}
                  className="-me-1.5 flex size-7 items-center justify-center rounded-full hover:bg-white/20"><X className="size-3.5" /></button>
              )}
            </span>
          ))}
        </div>

        {menu === 'page' && isOwner && (
          <div className={menuAt('actions')} dir="ltr">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 0} aria-label={t('prevPage')} title={t('prevPage')} className={btn}><Prev className="size-5" /></button>
            <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{page + 1} / {board.pages}</span>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= board.pages - 1} aria-label={t('nextPage')} title={t('nextPage')} className={btn}><Next className="size-5" /></button>
            <button type="button" onClick={insertPage} disabled={board.pages >= MAX_PAGES} aria-label={t('addPage')} title={t('addPage')} className={btn}><FilePlus2 className="size-5" /></button>
            <button type="button" onClick={() => { if (confirm(t('confirmDeletePage'))) deletePage(); }} aria-label={t('deletePage')} title={t('deletePage')} className={btn}><FileX2 className="size-5" /></button>
          </div>
        )}
        {menu === 'timer' && presenting && (
          <div className={menuAt('actions')}>
            {TIMERS.map((m) => (
              <button key={m} type="button" onClick={() => { setTimer(m); setMenu(null); }} className="min-h-9 rounded-full bg-black/5 px-3 text-xs font-semibold hover:bg-black/10">{t('minutes', { n: m })}</button>
            ))}
            {left !== null && <button type="button" onClick={() => { setTimer(null); setMenu(null); }} className="min-h-9 rounded-full bg-black/5 px-3 text-xs font-semibold text-[#d9443c] hover:bg-black/10">{t('stopTimer')}</button>}
          </div>
        )}
        {menu === 'color' && !roomy && !readOnly && (
          <div className={menuAt('tools')}>
            <div className="grid grid-cols-3 gap-0.5">{BOARD_COLORS.map(colorBtn)}</div>
            <span className={clsx('shrink-0 bg-black/10', vertical ? 'my-0.5 h-px w-full' : 'mx-0.5 h-8 w-px')} />
            <div className="flex gap-0.5">{PEN_SIZES.map(sizeBtn)}</div>
          </div>
        )}
      </div>

      {/* Drawing tools: a bar below the board, or beside it */}
      {!readOnly && (
        <div className={clsx(rail, vertical ? 'my-auto' : 'mx-auto')}>
          {toolBtn('pen', Pen, t('pen'))}
          {toolBtn('highlighter', Highlighter, t('highlighter'))}
          {toolBtn('eraser', Eraser, t('eraser'))}
          {toolBtn('text', Type, t('text'))}
          {toolBtn('move', Move, t('move'))}
          {toolBtn('laser', Crosshair, t('laser'))}
          {iconBtn(ImagePlus, t('image'), () => fileInput.current?.click(), uploading, false)}
          {isOwner && iconBtn(Trash2, t('clear'), () => { if (confirm(t('confirmClear'))) op({ t: 'clear', pg: page }); }, items.length === 0, false)}
          <span className={sep} />
          {roomy ? (
            <>
              {BOARD_COLORS.map(colorBtn)}
              <span className={sep} />
              {PEN_SIZES.map(sizeBtn)}
            </>
          ) : (
            <button type="button" onClick={() => toggleMenu('color')} aria-expanded={menu === 'color'} aria-label={`${t('color')} · ${t('size')}`} title={`${t('color')} · ${t('size')}`}
              className={clsx(btn, menu === 'color' && 'bg-black/10')}>
              <span className="flex size-7 items-center justify-center rounded-full ring-2 ring-[#2f5d45] ring-offset-1" style={{ background: color }}>
                <span className="block rounded-full bg-white/90" style={{ width: 3 + size * 3, height: 3 + size * 3 }} />
              </span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
    </div>
  );
}
