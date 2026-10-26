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
import { drawBoard, memberColor } from '@/lib/board/draw';
import {
  BOARD_COLORS, BOARD_H, BOARD_W, MAX_PAGES, PEN_SIZES, TEXT_SIZES, addPoint, fitImage, itemAt, mayEdit, moveItem, onPage, type BoardItem, type BoardOp,
} from '@/lib/board/model';
import {
  boardOf, boardOp, canRedo, canUndo, deletePage, goToPage, insertPage, lasersOn, pointLaser, present, recordStep, redo, setTimer, shareDrawing,
  subscribeLasers, undo, useBoard, usePresentation, writingNow, type Laser,
} from '@/lib/board/sync';
import { lowerHand, useHands } from '@/lib/board/hands';
import { syncedNow } from '@/lib/realtime/room';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'move' | 'laser';
const newId = () => crypto.randomUUID().slice(0, 12);
const SEND_EVERY = 50; // ms between live updates of a stroke or a drag
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
  const [timerMenu, setTimerMenu] = useState(false);
  const [tick, rerender] = useState(0); // bumps when a picture or a font finished loading, or a "writing now" tag expires
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The gesture in progress: the board before it (for undo), the stroke being drawn or the item being moved (`moved`: where it is now).
  const gesture = useRef<{ pointer: number; before: BoardItem[]; item: BoardItem | null; moved?: BoardItem; start: [number, number]; sent: number; erased: string[] } | null>(null);

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
  const paint = useCallback(() => {
    const c = canvas.current;
    if (!c || !box.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(box.w * dpr)) { c.width = Math.round(box.w * dpr); c.height = Math.round(box.h * dpr); }
    const list = draft ? [...items.filter((i) => i.id !== draft.id), draft] : items;
    drawBoard(c.getContext('2d')!, list, c.width / BOARD_W, () => rerender((n) => n + 1), { grid: !readOnly, tags });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, draft, box, readOnly, tags, tick]);
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
      if (now - g.sent > SEND_EVERY) { g.sent = now; op({ t: 'put', item: g.item }, false); }
    } else if (tool === 'eraser') {
      for (const [x, y] of pts) erase(x, y);
    } else if (tool === 'move' && g.item) {
      const [x, y] = pts[pts.length - 1];
      const orig = g.before.find((i) => i.id === g.item!.id) ?? g.item;
      const moved = moveItem(orig, x - g.start[0], y - g.start[1]);
      g.moved = moved;
      setDraft(moved);
      if (now - g.sent > SEND_EVERY) { g.sent = now; op({ t: 'put', item: moved }, false); }
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
      if (e.key === 'Escape') onClose();
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(owner); rerender((n) => n + 1); }
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(owner); rerender((n) => n + 1); }
      if (isOwner && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); goToPage(page + (e.key === 'PageDown' ? 1 : -1)); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edit, onClose, readOnly, owner, isOwner, page]);
  // Leaving the laser tool (or the board) hides one's pointer.
  useEffect(() => { if (tool !== 'laser') return; return () => pointLaser(owner, null); }, [tool, owner]);

  const presenting = presenter === user.id;
  const othersPresent = !!presenter && !presenting;
  const left = show.timerEnd ? show.timerEnd - syncedNow() : null;
  const toolBtn = (k: Tool, Icon: typeof Pen, label: string) => (
    <button key={k} type="button" onClick={() => { commitText(); setTool(k); }} aria-pressed={tool === k} title={label} aria-label={label}
      className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 max-[400px]:size-8 sm:size-11 short:size-9', tool === k ? 'bg-[#2f5d45] text-white shadow' : 'text-[#3b332c] hover:bg-black/5')}>
      <Icon className="size-5" />
    </button>
  );
  const iconBtn = (Icon: typeof Pen, label: string, onClick: () => void, disabled = false, flip = true) => (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className="flex size-9 shrink-0 items-center justify-center rounded-xl text-[#3b332c] transition-all hover:bg-black/5 active:scale-90 disabled:opacity-30 max-[400px]:size-8 sm:size-11 short:size-9">
      <Icon className={clsx('size-5', flip && 'rtl:-scale-x-100')} />
    </button>
  );
  const chip = 'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold';
  const Prev = ChevronLeft, Next = ChevronRight;

  return (
    <div className={clsx('fixed z-[70] flex flex-col bg-[#ebe5db] text-[#2b241e]',
      split
        // Beside the office (landscape) or under it (portrait), the office keeps the rest of the screen.
        ? 'inset-x-0 bottom-0 h-[58dvh] rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)] landscape:inset-y-0 landscape:start-0 landscape:end-auto landscape:h-auto landscape:w-[58vw] landscape:rounded-none landscape:pt-[env(safe-area-inset-top)] landscape:shadow-[0_0_30px_rgba(0,0,0,0.3)]'
        : 'inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]')} role="dialog" aria-modal={!split} aria-label={t('title')}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 short:py-1">
        <button type="button" onClick={() => { commitText(); onClose(); }} aria-label={t('close')} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/70 hover:bg-white"><X className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{onScreen ? t('viewing', { name: presenterName }) : t('title')}</div>
          <div className="truncate text-xs text-[#6d6258]">
            {onScreen ? (show.shared ? t('everyoneDraws') : t('onlyPresenter', { name: presenterName })) : presenting ? t('youPresent') : othersPresent ? t('presenting', { name: presenterName }) : t('sameBoard')}
          </div>
        </div>
        {onSplit && (
          <button type="button" onClick={() => onSplit(!split)} title={split ? t('fullView') : t('splitView')} aria-label={split ? t('fullView') : t('splitView')}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white/80 px-3 text-sm font-semibold shadow-sm transition-all hover:bg-white active:scale-95">
            {split ? <Maximize2 className="size-4" /> : <Columns2 className="size-4" />}<span className="max-lg:hidden">{split ? t('fullView') : t('splitView')}</span>
          </button>
        )}
        {othersPresent && (
          <button type="button" onClick={() => { commitText(); setWatching(!onScreen); }}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white/80 px-3 text-sm font-semibold shadow-sm transition-all hover:bg-white active:scale-95">
            {onScreen ? <Pen className="size-4" /> : <Eye className="size-4" />}<span className="max-[480px]:hidden">{onScreen ? t('myBoard') : t('view')}</span>
          </button>
        )}
        {!onScreen && (
          <button type="button" disabled={othersPresent} onClick={() => present(!presenting)}
            className={clsx('flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white shadow transition-all active:scale-95 disabled:opacity-40',
              presenting ? 'bg-[#d9443c]' : 'bg-[#2f5d45]')}>
            {presenting ? <MonitorUp className="size-4" /> : <Cast className="size-4" />}
            <span className="max-[480px]:hidden">{presenting ? t('stopPresent') : t('present')}</span>
            {presenting && <span className="size-2 animate-pulse rounded-full bg-white" />}
          </button>
        )}
      </div>

      {/* Presentation bar: pages, and while presenting the drawing permission, the countdown and raised hands */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-1.5 [scrollbar-width:none]">
        {isOwner ? (
          <div className="flex shrink-0 items-center rounded-full bg-white/80 shadow-sm">
            <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 0} aria-label={t('prevPage')} title={t('prevPage')} className="flex size-9 items-center justify-center rounded-full disabled:opacity-30"><Prev className="size-4 rtl:-scale-x-100" /></button>
            <span className="min-w-12 text-center text-xs font-semibold tabular-nums" dir="ltr">{page + 1} / {board.pages}</span>
            <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= board.pages - 1} aria-label={t('nextPage')} title={t('nextPage')} className="flex size-9 items-center justify-center rounded-full disabled:opacity-30"><Next className="size-4 rtl:-scale-x-100" /></button>
            <button type="button" onClick={insertPage} disabled={board.pages >= MAX_PAGES} aria-label={t('addPage')} title={t('addPage')} className="flex size-9 items-center justify-center rounded-full disabled:opacity-30"><FilePlus2 className="size-4" /></button>
            <button type="button" onClick={() => { if (confirm(t('confirmDeletePage'))) deletePage(); }} aria-label={t('deletePage')} title={t('deletePage')} className="flex size-9 items-center justify-center rounded-full"><FileX2 className="size-4" /></button>
          </div>
        ) : board.pages > 1 && <span className={clsx(chip, 'bg-white/80')} dir="ltr">{t('page')} {page + 1} / {board.pages}</span>}
        {presenting && (
          <>
            <button type="button" onClick={() => shareDrawing(!show.shared)} aria-pressed={show.shared}
              className={clsx(chip, show.shared ? 'bg-[#2f5d45] text-white' : 'bg-white/80')}>
              {show.shared ? <Users className="size-4" /> : <Lock className="size-4" />}{show.shared ? t('everyoneDrawsShort') : t('onlyMe')}
            </button>
            <div className="relative shrink-0">
              <button type="button" onClick={() => setTimerMenu((x) => !x)} aria-expanded={timerMenu} className={clsx(chip, 'bg-white/80')}>
                <Timer className="size-4" />{left !== null ? <span dir="ltr" className="tabular-nums">{clock(left)}</span> : t('timer')}
              </button>
            </div>
            {timerMenu && (
              <div className="flex shrink-0 items-center gap-1">
                {TIMERS.map((m) => (
                  <button key={m} type="button" onClick={() => { setTimer(m); setTimerMenu(false); }} className={clsx(chip, 'bg-white')}>{t('minutes', { n: m })}</button>
                ))}
                {left !== null && <button type="button" onClick={() => { setTimer(null); setTimerMenu(false); }} className={clsx(chip, 'bg-white text-[#d9443c]')}>{t('stopTimer')}</button>}
              </div>
            )}
          </>
        )}
        {!presenting && presenter && left !== null && (
          <span className={clsx(chip, left < 0 ? 'bg-[#d9443c] text-white' : left < 60_000 ? 'bg-[#f08a24] text-white' : 'bg-white/80')}>
            <Timer className="size-4" /><span dir="ltr" className="tabular-nums">{clock(left)}</span>
          </span>
        )}
        {hands.map((id) => (
          <span key={id} className={clsx(chip, 'bg-[#5b8def] text-white')}>
            <Hand className="size-4" />{nameOf(id)}
            {presenting && id !== user.id && (
              <button type="button" onClick={() => lowerHand(id)} aria-label={t('lowerHand', { name: nameOf(id) ?? '' })} title={t('lowerHand', { name: nameOf(id) ?? '' })}
                className="-me-1.5 flex size-7 items-center justify-center rounded-full hover:bg-white/20"><X className="size-3.5" /></button>
            )}
          </span>
        ))}
      </div>

      {/* Board, with the tools under it (beside it on a phone held sideways) */}
      <div className="flex min-h-0 flex-1 flex-col short:flex-row">
      <div ref={wrap} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-2">
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
            <div className="absolute z-10 w-[min(22rem,80%)]" style={{ left: Math.min(toScreen(edit.x, edit.y).left, box.w * 0.2), top: Math.max(0, Math.min(toScreen(edit.x, edit.y).top, box.h - 120)) }}>
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
          {!readOnly && !split && box.w < 520 && <div className="pointer-events-none absolute inset-x-0 -bottom-7 text-center text-[11px] text-[#9a8f84] landscape:hidden">{t('rotate')}</div>}
          {error && <div role="alert" className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-[#d9443c] px-3 py-1.5 text-xs text-white">{error}</div>}
        </div>
      </div>

      {/* Tools */}
      {!readOnly && (
        // Two rows on phones (tools, then colours and sizes), one row on wide screens; scrolls if it still does not fit.
        <div className={clsx('mx-auto my-2 flex max-w-[calc(100%-1rem)] flex-col items-center gap-1 rounded-2xl bg-white/85 p-1.5 shadow-lg backdrop-blur short:mx-2 short:my-auto short:max-h-[calc(100%-1rem)] short:flex-row-reverse short:items-start short:overflow-y-auto',
          !split && 'xl:flex-row')}>
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto sm:gap-1 short:flex-col short:gap-0 short:overflow-visible">
          {toolBtn('pen', Pen, t('pen'))}
          {toolBtn('highlighter', Highlighter, t('highlighter'))}
          {toolBtn('eraser', Eraser, t('eraser'))}
          {toolBtn('text', Type, t('text'))}
          {toolBtn('move', Move, t('move'))}
          {toolBtn('laser', Crosshair, t('laser'))}
          {iconBtn(ImagePlus, t('image'), () => fileInput.current?.click(), uploading, false)}
          {iconBtn(Undo2, t('undo'), () => { undo(owner); rerender((n) => n + 1); }, !canUndo(owner))}
          {iconBtn(Redo2, t('redo'), () => { redo(owner); rerender((n) => n + 1); }, !canRedo(owner))}
          {isOwner && iconBtn(Trash2, t('clear'), () => { if (confirm(t('confirmClear'))) op({ t: 'clear', pg: page }); }, items.length === 0, false)}
          </div>
          <span className={clsx('mx-1 hidden h-7 w-px shrink-0 bg-black/10 short:hidden', !split && 'xl:block')} />
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto sm:gap-1 short:flex-col short:gap-0 short:overflow-visible">
          {BOARD_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => { setColor(c); if (tool !== 'pen' && tool !== 'highlighter' && tool !== 'text') setTool('pen'); }} aria-label={`${t('color')} ${c}`} aria-pressed={color === c}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90">
              <span className={clsx('block rounded-full transition-all', color === c ? 'size-7 ring-2 ring-offset-2 ring-[#2f5d45]' : 'size-6')} style={{ background: c }} />
            </button>
          ))}
          <span className="mx-1 h-7 w-px shrink-0 bg-black/10 short:mx-0 short:my-0.5 short:h-px short:w-6" />
          {PEN_SIZES.map((s, i) => (
            <button key={s} type="button" onClick={() => setSize(i)} aria-label={`${t('size')} ${i + 1}`} aria-pressed={size === i}
              className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', size === i ? 'bg-black/10' : 'hover:bg-black/5')}>
              <span className="block rounded-full bg-[#3b332c]" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
          </div>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      </div>
      {readOnly && <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-[#6d6258]"><Eye className="size-3.5" />{t('viewing', { name: presenterName })}</div>}
    </div>
  );
}
