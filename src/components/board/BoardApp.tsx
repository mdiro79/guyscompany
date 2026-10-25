'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Pen, Eraser, Type, ImagePlus, Move, Undo2, Redo2, Trash2, X, Cast, MonitorUp, Loader2, Eye } from 'lucide-react';
import { useShell } from '@/components/shell/ShellContext';
import { uploadFile } from '@/lib/upload';
import { drawBoard } from '@/lib/board/draw';
import {
  BOARD_COLORS, BOARD_H, BOARD_W, PEN_SIZES, TEXT_SIZES, addPoint, fitImage, itemAt, moveItem, type BoardItem, type BoardOp,
} from '@/lib/board/model';
import { boardItems, boardOp, canRedo, canUndo, present, recordStep, redo, undo, useBoardItems, usePresenter } from '@/lib/board/sync';

type Tool = 'pen' | 'eraser' | 'text' | 'move';
const newId = () => crypto.randomUUID().slice(0, 12);
const SEND_EVERY = 50; // ms between live updates of a stroke or a drag

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

/**
 * A member's drawing board, full screen; works with touch, pen and mouse. While someone else presents,
 * "View screen" shows their board read-only (what the conference screen shows); `watch` opens it that way.
 */
export function BoardApp({ onClose, watch = false }: { onClose: () => void; watch?: boolean }) {
  const t = useTranslations('board');
  const { user, profiles } = useShell();
  const presenter = usePresenter();
  const [watching, setWatching] = useState(watch);
  const readOnly = watching && !!presenter && presenter !== user.id;
  const owner = readOnly ? presenter! : user.id;
  const items = useBoardItems(owner);
  const presenterName = profiles.find((p) => p.id === presenter)?.displayName ?? '';
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(BOARD_COLORS[0]);
  const [size, setSize] = useState(1);
  const [draft, setDraft] = useState<BoardItem | null>(null);
  const [edit, setEdit] = useState<TextEdit | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, rerender] = useState(0); // bumps when a picture or a font finished loading
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

  const paint = useCallback(() => {
    const c = canvas.current;
    if (!c || !box.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(box.w * dpr)) { c.width = Math.round(box.w * dpr); c.height = Math.round(box.h * dpr); }
    const list = draft ? [...items.filter((i) => i.id !== draft.id), draft] : items;
    drawBoard(c.getContext('2d')!, list, c.width / BOARD_W, () => rerender((n) => n + 1), { grid: !readOnly });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, draft, box, readOnly, tick]);
  useEffect(() => { const id = requestAnimationFrame(paint); return () => cancelAnimationFrame(id); }, [paint]);
  // Web fonts load after the first paint; repaint when they are ready so text uses them.
  useEffect(() => { document.fonts?.ready.then(() => rerender((n) => n + 1), () => {}); }, []);

  const toBoard = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_W, ((e.clientY - r.top) / r.height) * BOARD_H];
  };
  const toScreen = (x: number, y: number) => ({ left: (x / BOARD_W) * box.w, top: (y / BOARD_H) * box.h });

  const commitText = () => {
    if (!edit) return;
    const text = edit.value.trim();
    const op: BoardOp = text
      ? { t: 'put', item: { id: edit.id, kind: 'text', x: Math.round(edit.x), y: Math.round(edit.y), text, color: edit.color, size: edit.size } }
      : { t: 'del', id: edit.id };
    if (text || items.some((i) => i.id === edit.id)) boardOp(op);
    setEdit(null);
  };

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || gesture.current || !e.isPrimary) return;
    const [x, y] = toBoard(e);
    if (tool === 'text') {
      if (edit) { commitText(); return; }
      const hit = itemAt(items, x, y, 4);
      if (hit?.kind === 'text') setEdit({ id: hit.id, x: hit.x, y: hit.y, value: hit.text, color: hit.color, size: hit.size });
      else setEdit({ id: newId(), x, y: y - TEXT_SIZES[size] / 2, value: '', color, size: TEXT_SIZES[size] });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const before = boardItems(user.id);
    if (tool === 'pen') {
      const item: BoardItem = { id: newId(), kind: 'stroke', color, size: PEN_SIZES[size], points: addPoint([], x, y) };
      gesture.current = { pointer: e.pointerId, before, item, start: [x, y], sent: 0, erased: [] };
      setDraft(item);
    } else if (tool === 'eraser') {
      gesture.current = { pointer: e.pointerId, before, item: null, start: [x, y], sent: 0, erased: [] };
      erase(x, y);
    } else {
      const hit = itemAt(items, x, y);
      gesture.current = { pointer: e.pointerId, before, item: hit, start: [x, y], sent: 0, erased: [] };
    }
  };

  const erase = (x: number, y: number) => {
    const g = gesture.current!;
    const hit = itemAt(boardItems(user.id), x, y, 6 + PEN_SIZES[size]);
    if (hit) { g.erased.push(hit.id); boardOp({ t: 'del', id: hit.id }, false); }
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    // Every coalesced point (fast strokes on phones and pens) for smooth lines.
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    const pts = (events.length ? events : [e.nativeEvent]).map(toBoard);
    const now = performance.now();
    if (tool === 'pen' && g.item?.kind === 'stroke') {
      let points = g.item.points;
      for (const [x, y] of pts) points = addPoint(points, x, y);
      g.item = { ...g.item, points };
      setDraft(g.item);
      if (now - g.sent > SEND_EVERY) { g.sent = now; boardOp({ t: 'put', item: g.item }, false); }
    } else if (tool === 'eraser') {
      for (const [x, y] of pts) erase(x, y);
    } else if (tool === 'move' && g.item) {
      const [x, y] = pts[pts.length - 1];
      const orig = g.before.find((i) => i.id === g.item!.id) ?? g.item;
      const moved = moveItem(orig, x - g.start[0], y - g.start[1]);
      g.moved = moved;
      setDraft(moved);
      if (now - g.sent > SEND_EVERY) { g.sent = now; boardOp({ t: 'put', item: moved }, false); }
    }
  };

  const up = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    gesture.current = null;
    if (tool === 'pen' && g.item) {
      boardOp({ t: 'put', item: g.item }, false);
      recordStep(g.before, [{ t: 'put', item: g.item }]);
    } else if (tool === 'eraser' && g.erased.length) {
      recordStep(g.before, g.erased.map((id) => ({ t: 'del', id })));
    } else if (tool === 'move' && g.moved) {
      boardOp({ t: 'put', item: g.moved }, false);
      recordStep(g.before, [{ t: 'put', item: g.moved }]);
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
      boardOp({ t: 'put', item: { id: newId(), kind: 'image', fileId, w, h, x: Math.round((BOARD_W - w) / 2), y: Math.round((BOARD_H - h) / 2) } });
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

  // Keyboard: Esc closes, Ctrl/Cmd+Z undoes, Shift (or Y) redoes.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (edit) return;
      if (e.key === 'Escape') onClose();
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? redo : undo)(); rerender((n) => n + 1); }
      if (!readOnly && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); rerender((n) => n + 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edit, onClose, readOnly]);

  const presenting = presenter === user.id;
  const othersPresent = !!presenter && !presenting;
  const toolBtn = (k: Tool, Icon: typeof Pen, label: string) => (
    <button key={k} type="button" onClick={() => { commitText(); setTool(k); }} aria-pressed={tool === k} title={label} aria-label={label}
      className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 sm:size-11 short:size-9', tool === k ? 'bg-[#2f5d45] text-white shadow' : 'text-[#3b332c] hover:bg-black/5')}>
      <Icon className="size-5" />
    </button>
  );
  const iconBtn = (Icon: typeof Pen, label: string, onClick: () => void, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#3b332c] transition-all hover:bg-black/5 active:scale-90 disabled:opacity-30 sm:size-11 short:size-9">
      <Icon className="size-5 rtl:-scale-x-100" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#ebe5db] text-[#2b241e] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal aria-label={t('title')}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 short:py-1">
        <button type="button" onClick={() => { commitText(); onClose(); }} aria-label={t('close')} className="flex size-11 items-center justify-center rounded-xl bg-white/70 hover:bg-white"><X className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{readOnly ? t('viewing', { name: presenterName }) : t('title')}</div>
          <div className="truncate text-xs text-[#6d6258]">
            {readOnly ? '' : presenting ? t('youPresent') : othersPresent ? t('presenting', { name: presenterName }) : t('sameBoard')}
          </div>
        </div>
        {othersPresent && (
          <button type="button" onClick={() => { commitText(); setWatching(!readOnly); }}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-white/80 px-3 text-sm font-semibold shadow-sm transition-all hover:bg-white active:scale-95">
            {readOnly ? <Pen className="size-4" /> : <Eye className="size-4" />}<span className="max-[420px]:hidden">{readOnly ? t('myBoard') : t('view')}</span>
          </button>
        )}
        {!readOnly && (
          <button type="button" disabled={othersPresent} onClick={() => present(!presenting)}
            className={clsx('flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white shadow transition-all active:scale-95 disabled:opacity-40',
              presenting ? 'bg-[#d9443c]' : 'bg-[#2f5d45]')}>
            {presenting ? <MonitorUp className="size-4" /> : <Cast className="size-4" />}
            <span className="max-[380px]:hidden">{presenting ? t('stopPresent') : t('present')}</span>
            {presenting && <span className="size-2 animate-pulse rounded-full bg-white" />}
          </button>
        )}
      </div>

      {/* Board, with the tools under it (beside it on a phone held sideways) */}
      <div className="flex min-h-0 flex-1 flex-col short:flex-row">
      <div ref={wrap} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-2">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            className={clsx('block size-full touch-none rounded-2xl shadow-[0_8px_30px_rgba(60,40,20,0.15)] ring-1 ring-black/5',
              !readOnly && (tool === 'move' ? 'cursor-grab' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'))}
            style={{ width: box.w, height: box.h }} />
          {items.length === 0 && !draft && !edit && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#9a8f84]">{readOnly ? '' : t('empty')}</div>
          )}
          {edit && (
            <div className="absolute z-10 w-[min(22rem,80%)]" style={{ left: Math.min(toScreen(edit.x, edit.y).left, box.w * 0.2), top: Math.min(toScreen(edit.x, edit.y).top, box.h - 120) }}>
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
          {!readOnly && box.w < 520 && <div className="pointer-events-none absolute inset-x-0 -bottom-7 text-center text-[11px] text-[#9a8f84] landscape:hidden">{t('rotate')}</div>}
          {error && <div role="alert" className="absolute inset-x-0 top-3 mx-auto w-max rounded-full bg-[#d9443c] px-3 py-1.5 text-xs text-white">{error}</div>}
        </div>
      </div>

      {/* Tools */}
      {!readOnly && (
        // Two rows on phones (tools, then colours and sizes), one row on wider screens.
        <div className="mx-auto my-2 flex max-w-[calc(100%-1rem)] flex-col items-center gap-1 rounded-2xl bg-white/85 p-1.5 shadow-lg backdrop-blur md:flex-row short:mx-2 short:my-auto short:flex-row-reverse short:items-start">
          <div className="flex items-center gap-0.5 sm:gap-1 short:flex-col short:gap-0">
          {toolBtn('pen', Pen, t('pen'))}
          {toolBtn('eraser', Eraser, t('eraser'))}
          {toolBtn('text', Type, t('text'))}
          {toolBtn('move', Move, t('move'))}
          {iconBtn(ImagePlus, t('image'), () => fileInput.current?.click(), uploading)}
          {iconBtn(Undo2, t('undo'), () => { undo(); rerender((n) => n + 1); }, !canUndo())}
          {iconBtn(Redo2, t('redo'), () => { redo(); rerender((n) => n + 1); }, !canRedo())}
          {iconBtn(Trash2, t('clear'), () => { if (confirm(t('confirmClear'))) boardOp({ t: 'clear' }); }, items.length === 0)}
          </div>
          <span className="mx-1 hidden h-7 w-px shrink-0 bg-black/10 md:block short:hidden" />
          <div className="flex items-center gap-0.5 sm:gap-1 short:flex-col short:gap-0">
          {BOARD_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => { setColor(c); if (tool === 'eraser' || tool === 'move') setTool('pen'); }} aria-label={`${t('color')} ${c}`} aria-pressed={color === c}
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
