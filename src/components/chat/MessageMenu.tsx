'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Reply, Copy, Pencil, Pin, PinOff, Forward, Trash2, ListPlus, Bug, Eye, Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { Message, Profile } from '@/lib/data/types';
import { DecisionGlyph } from '@/components/icons/glyphs';
import { EMOJI } from './emoji';

export const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '🎉', '👏', '🙏'];

export interface MenuActions {
  reply: () => void; copy: () => void; edit?: () => void; pin: () => void; forward?: () => void; decide?: () => void;
  task?: () => void; bug?: () => void; remove?: () => void; react: (emoji: string) => void;
}

// The menu of a message: a row of reactions on top, then the actions. A bottom sheet on touch screens
// (Telegram style, the chat dims behind it) and a small menu at the pointer on computers.
export function MessageMenu({ message, at, actions, seenBy, onClose }: {
  message: Message; at: { x: number; y: number }; actions: MenuActions; seenBy: Profile[]; onClose: () => void;
}) {
  const t = useTranslations('chatPage');
  const box = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState(false);
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // A long press opens the menu while the finger is still down: lifting it must not close the menu,
  // so the backdrop only closes it for a press that started on the backdrop itself.
  const pressed = useRef(false);
  const backdrop = {
    onPointerDown: (e: React.PointerEvent) => { pressed.current = e.target === e.currentTarget; },
    onClick: (e: React.MouseEvent) => { if (pressed.current && e.target === e.currentTarget) onClose(); pressed.current = false; },
  };
  useEffect(() => { setSheet(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640); }, []);
  useLayoutEffect(() => {
    if (sheet || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [sheet, at.x, at.y, more]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const run = (fn?: () => void) => () => { onClose(); fn?.(); };
  const item = (icon: ReactNode, label: string, fn?: () => void, danger?: boolean) => fn && (
    <button type="button" onClick={run(fn)} className={clsx('flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-[15px] hover:bg-surface-2 active:bg-surface-2', danger && 'text-danger')}>
      <span className="flex size-5 items-center justify-center">{icon}</span>{label}
    </button>
  );
  const reactions = (
    <div className="flex items-center gap-0.5 overflow-x-auto p-1.5 scrollbar-thin">
      {QUICK_REACTIONS.map((e) => {
        const on = message.reactions.some((r) => r.emoji === e);
        return <button key={e} type="button" onClick={run(() => actions.react(e))} className={clsx('flex size-11 shrink-0 items-center justify-center rounded-full text-2xl transition hover:scale-125 active:scale-90', on && 'bg-brand-soft')}>{e}</button>;
      })}
      <button type="button" onClick={() => setMore((x) => !x)} aria-label={t('moreReactions')} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Plus className="size-5" /></button>
    </div>
  );
  const grid = more && (
    <div className="grid grid-cols-8 gap-0.5 border-t border-line p-1.5">
      {EMOJI.map((e) => <button key={e} type="button" onClick={run(() => actions.react(e))} className="flex size-9 items-center justify-center rounded-lg text-xl hover:bg-surface-2">{e}</button>)}
    </div>
  );
  const list = (
    <div className="p-1.5">
      {seenBy.length > 0 && (
        <div className="mb-1 flex items-center gap-2 border-b border-line px-3 pb-2 text-xs text-muted">
          <Eye className="size-4" />{t('seenBy')}
          <span className="flex -space-x-2 rtl:space-x-reverse">{seenBy.map((p) => <span key={p.id} className="rounded-full ring-2 ring-surface"><Avatar profile={p} size="sm" /></span>)}</span>
        </div>
      )}
      {item(<Reply className="size-5" />, t('reply'), actions.reply)}
      {message.body && item(<Copy className="size-5" />, t('copy'), actions.copy)}
      {item(<Pencil className="size-5" />, t('edit'), actions.edit)}
      {item(message.pinnedAt ? <PinOff className="size-5" /> : <Pin className="size-5" />, message.pinnedAt ? t('unpin') : t('pin'), actions.pin)}
      {item(<Forward className="size-5" />, t('forward'), actions.forward)}
      {actions.decide && item(<DecisionGlyph className="size-5 text-[#a26a00] dark:text-[#f0c766]" />, message.kind === 'decision' ? t('undecide') : t('markDecision'), actions.decide)}
      {(actions.task || actions.bug) && <div className="my-1 border-t border-line" />}
      {item(<ListPlus className="size-5 text-brand" />, t('makeTask'), actions.task)}
      {item(<Bug className="size-5 text-[#c24141]" />, t('makeBug'), actions.bug)}
      {actions.remove && <div className="my-1 border-t border-line" />}
      {item(<Trash2 className="size-5" />, t('delete'), actions.remove, true)}
    </div>
  );

  if (sheet) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/35 backdrop-blur-[2px]" {...backdrop}>
        <div className="gc-sheet mx-auto w-full max-w-lg rounded-t-3xl bg-surface pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
          {reactions}{grid}
          <div className="max-h-[55dvh] overflow-y-auto border-t border-line">{list}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[60]" {...backdrop} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div ref={box} style={pos ? { left: pos.left, top: pos.top } : { left: at.x, top: at.y, visibility: 'hidden' }}
        className="card gc-menu absolute w-72 overflow-hidden shadow-xl">
        {reactions}{grid}<div className="border-t border-line">{list}</div>
      </div>
    </div>
  );
}
