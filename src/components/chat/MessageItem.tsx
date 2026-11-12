'use client';
import { memo, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Reply, Check, CheckCheck, Clock3, Pencil, Forward, SmilePlus, MoreHorizontal, FileText, Download } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { FileMeta, Message, Profile } from '@/lib/data/types';
import { isAudio, isImage, tokenize, type MessageRow } from '@/lib/chat';
import { formatBytes, formatTime } from '@/lib/format';
import { DecisionGlyph } from '@/components/icons/glyphs';
import { VoicePlayer } from './VoicePlayer';

const SWIPE_AT = 56; // px the bubble must travel to reply
const LONG_PRESS_MS = 420;
const QUICK_REACTION = '👍';

// A member's name colour in group chats (like Telegram), stable per person.
const NAME_COLORS = ['text-[#d0602a] dark:text-[#f59a52]', 'text-[#2c7fb8] dark:text-[#7fb8e8]', 'text-[#7a4fc4] dark:text-[#b9a6f5]', 'text-[#1f8a6a] dark:text-[#5fcf9f]', 'text-[#c2417a] dark:text-[#f29ac0]', 'text-[#9a7a10] dark:text-[#e8c75a]'];
export const nameColor = (id: string | null) => NAME_COLORS[[...(id ?? '')].reduce((s, c) => s + c.charCodeAt(0), 0) % NAME_COLORS.length];

export interface ItemProps {
  row: MessageRow;
  mine: boolean;
  author: Profile | null;
  forwardedFrom: Profile | null;
  replyTo: Message | null; // null: deleted, or older than what is loaded
  replyAuthor: Profile | null;
  replyPreview: string;
  file: FileMeta | null;
  localFile: { url: string; mime: string; name: string; size: number } | null;
  sending: boolean;
  seen: boolean;
  highlight: boolean;
  card?: ReactNode; // a task or bug card instead of text
  reactionsBy: (userIds: string[]) => string;
  meId: string;
  onReply: (m: Message) => void;
  onMenu: (m: Message, x: number, y: number) => void;
  onReact: (m: Message, emoji: string) => void;
  onJump: (id: string) => void;
  onImage: (url: string) => void;
}

function Text({ body }: { body: string }) {
  return <>{tokenize(body).map((tok, i) => tok.kind === 'link'
    ? <a key={i} href={tok.value} target="_blank" rel="noreferrer noopener" className="break-all underline decoration-1 underline-offset-2" dir="ltr" onClick={(e) => e.stopPropagation()}>{tok.value}</a>
    : tok.kind === 'mention' ? <span key={i} className="font-semibold text-teal">{tok.value}</span> : <span key={i}>{tok.value}</span>)}</>;
}

export const MessageItem = memo(function MessageItem(p: ItemProps) {
  const t = useTranslations('chatPage');
  const locale = useLocale();
  const { message: m, first, last } = p.row;
  const rowRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const g = useRef({ id: -1, x: 0, y: 0, dir: '' as '' | 'h' | 'v', fired: false, long: false, timer: 0, lastTap: 0, touch: false });

  const reset = () => {
    const row = rowRef.current; const icon = iconRef.current;
    if (row) { row.style.transition = 'transform .22s cubic-bezier(.3,1.3,.5,1)'; row.style.transform = ''; }
    if (icon) { icon.style.transition = 'opacity .2s, transform .2s'; icon.style.opacity = '0'; icon.style.transform = 'scale(.4)'; }
  };

  // Touch gestures: swipe either way to reply, hold for the menu, double-tap for a quick reaction.
  // Vertical moves are left to the browser (touch-action: pan-y), so scrolling the chat stays smooth.
  const down = (e: React.PointerEvent) => {
    g.current.touch = e.pointerType !== 'mouse';
    if (e.pointerType === 'mouse' || p.sending) return;
    const s = g.current;
    s.id = e.pointerId; s.x = e.clientX; s.y = e.clientY; s.dir = ''; s.fired = false; s.long = false;
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      if (s.dir || s.id !== e.pointerId) return;
      s.long = true;
      navigator.vibrate?.(12);
      p.onMenu(m, s.x, s.y);
    }, LONG_PRESS_MS);
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id || s.long) return;
    const dx = e.clientX - s.x; const dy = e.clientY - s.y;
    if (!s.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      window.clearTimeout(s.timer);
      s.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
      if (s.dir === 'h') {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const icon = iconRef.current;
        if (icon) { icon.style.transition = 'none'; icon.style.insetInlineStart = ''; icon.style.left = dx > 0 ? '4px' : ''; icon.style.right = dx > 0 ? '' : '4px'; }
      }
    }
    if (s.dir !== 'h') return;
    const a = Math.abs(dx);
    const d = Math.sign(dx) * (a < SWIPE_AT ? a : Math.min(96, SWIPE_AT + (a - SWIPE_AT) * 0.3));
    const row = rowRef.current; const icon = iconRef.current;
    if (row) { row.style.transition = 'none'; row.style.transform = `translateX(${d}px)`; }
    const k = Math.min(1, Math.abs(d) / SWIPE_AT);
    if (icon) { icon.style.opacity = String(k); icon.style.transform = `scale(${0.4 + k * 0.6})`; }
    if (Math.abs(d) >= SWIPE_AT && !s.fired) { s.fired = true; navigator.vibrate?.(8); if (icon) icon.style.transform = 'scale(1.15)'; }
    if (Math.abs(d) < SWIPE_AT && s.fired) s.fired = false;
  };
  const up = (e: React.PointerEvent) => {
    const s = g.current;
    if (e.pointerId !== s.id) return;
    window.clearTimeout(s.timer);
    s.id = -1;
    if (s.dir === 'h') { if (s.fired) p.onReply(m); reset(); return; }
    if (s.long || s.dir) return;
    // A second tap soon after the first: quick reaction.
    const now = Date.now();
    if (now - s.lastTap < 300) { s.lastTap = 0; p.onReact(m, QUICK_REACTION); navigator.vibrate?.(6); } else s.lastTap = now;
  };
  const cancel = () => { window.clearTimeout(g.current.timer); g.current.id = -1; if (g.current.dir === 'h') reset(); };

  const grouped = Object.entries(m.reactions.reduce<Record<string, string[]>>((acc, r) => { (acc[r.emoji] ??= []).push(r.userId); return acc; }, {}));
  const file = p.file ?? (p.localFile ? { id: '', name: p.localFile.name, mime: p.localFile.mime, size: p.localFile.size } : null);
  const fileUrl = p.file ? `/api/files/${p.file.id}` : p.localFile?.url ?? '';
  const image = file && isImage(file.mime);
  const audio = file && isAudio(file.mime);
  const decision = m.kind === 'decision';
  const bubble = clsx('relative max-w-[min(34rem,85%)] min-w-0 px-3 pt-1.5 pb-1 text-[15px] leading-6 shadow-[0_1px_1px_rgba(0,0,0,.08)]',
    p.mine ? 'bg-[#dff3e4] dark:bg-[#24452f]' : 'bg-surface',
    'rounded-2xl', last && (p.mine ? 'rounded-ee-md' : 'rounded-es-md'),
    decision && 'ring-2 ring-[#d9a520]/70', p.card && 'w-[min(22rem,85%)] p-0! overflow-hidden', image && !m.body && 'p-1!');

  return (
    <div data-mid={m.id} className={clsx('relative', first ? 'mt-2' : 'mt-0.5')}>
      <span ref={iconRef} aria-hidden className="pointer-events-none absolute top-1/2 -mt-4 flex size-8 items-center justify-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur" style={{ transform: 'scale(.4)' }}>
        <Reply className="size-4.5" />
      </span>
      <div ref={rowRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        onContextMenu={(e) => { e.preventDefault(); if (!p.sending && !g.current.long) p.onMenu(m, e.clientX, e.clientY); g.current.long = false; }}
        onDoubleClick={() => { if (!g.current.touch && !p.sending) p.onReply(m); }}
        className={clsx('group flex items-end gap-2 px-2 [touch-action:pan-y] [-webkit-touch-callout:none] select-none sm:px-4', p.mine && 'flex-row-reverse',
          p.highlight && 'gc-flash')}>
        {!p.mine && <span className="w-9 shrink-0">{last && <Avatar profile={p.author} size="sm" />}</span>}
        <div className={clsx(bubble, p.sending && 'opacity-70')}>
          {decision && (
            <span className="-mx-3 -mt-1.5 mb-1 flex items-center gap-1.5 rounded-t-2xl bg-[#fbf1d3] px-3 py-1 text-[11px] font-bold tracking-wide text-[#8a6100] dark:bg-[#3a3016] dark:text-[#f0c766]">
              <DecisionGlyph className="size-4" />{t('decision')}
            </span>
          )}
          {first && !p.mine && !p.card && <div className={clsx('text-[13px] font-semibold leading-5', nameColor(m.authorId))}>{p.author?.displayName ?? '—'}</div>}
          {m.forwardedFrom && (
            <div className="flex items-center gap-1 text-[12px] text-teal"><Forward className="size-3.5" />{t('forwardedFrom', { name: p.forwardedFrom?.displayName ?? '—' })}</div>
          )}
          {m.replyToId && (
            <button type="button" onClick={(e) => { e.stopPropagation(); p.onJump(m.replyToId!); }}
              className={clsx('my-1 flex min-w-0 items-stretch gap-2 rounded-lg bg-black/[.05] py-1 pe-2 text-start dark:bg-white/[.06]', p.card ? 'mx-2 mt-2 w-[calc(100%-1rem)]' : 'w-full')}>
              <span className={clsx('w-[3px] shrink-0 rounded-full bg-current', nameColor(p.replyTo?.authorId ?? null))} />
              <span className="min-w-0 flex-1">
                <span className={clsx('block truncate text-[12px] font-semibold', nameColor(p.replyTo?.authorId ?? null))}>{p.replyTo ? p.replyAuthor?.displayName ?? '—' : t('replyTo')}</span>
                <span className="block truncate text-[12px] text-muted" dir="auto">{p.replyTo ? p.replyPreview : t('earlierMessage')}</span>
              </span>
            </button>
          )}
          {p.card}
          {file && image && (
            <button type="button" onClick={(e) => { e.stopPropagation(); p.onImage(fileUrl); }} className="block overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl} alt={file.name} loading="lazy" className="max-h-80 w-full min-w-40 bg-surface-2 object-cover" />
            </button>
          )}
          {file && audio && <VoicePlayer src={fileUrl} mine={p.mine} />}
          {file && !image && !audio && (
            <a href={fileUrl} onClick={(e) => e.stopPropagation()} className="my-1 flex items-center gap-3 rounded-xl bg-black/[.04] p-2 dark:bg-white/[.05]">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-ink"><FileText className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" dir="ltr">{file.name}</span><span className="text-xs text-muted">{formatBytes(locale, file.size)}</span></span>
              <Download className="size-4 text-muted" />
            </a>
          )}
          {m.body && !p.card && (
            <span dir="auto" className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"><Text body={m.body} /></span>
          )}
          {!p.card && (
            <span className={clsx('float-end ms-2 mt-1.5 flex items-center gap-1 text-[11px] leading-4 text-muted', image && !m.body && 'absolute bottom-2 end-2 rounded-full bg-black/45 px-1.5 py-0.5 text-white!')}>
              {m.pinnedAt && <span aria-label={t('pinned')}>📌</span>}
              {m.editedAt && <span className="flex items-center gap-0.5"><Pencil className="size-3" />{t('edited')}</span>}
              <span dir="ltr">{formatTime(locale, m.createdAt)}</span>
              {p.mine && (p.sending ? <Clock3 className="size-3.5" /> : p.seen ? <CheckCheck className="size-4 text-[#2a9d5a] dark:text-[#5fcf9f]" /> : <Check className="size-4" />)}
            </span>
          )}
          {grouped.length > 0 && (
            <div className={clsx('clear-both flex flex-wrap gap-1 pt-1', p.card && 'px-2 pb-2')}>
              {grouped.map(([emoji, users]) => (
                <button key={emoji} type="button" onClick={(e) => { e.stopPropagation(); p.onReact(m, emoji); }} title={p.reactionsBy(users)}
                  className={clsx('flex h-7 items-center gap-1 rounded-full px-2 text-sm transition active:scale-90', users.includes(p.meId) ? 'bg-brand text-brand-ink' : 'bg-black/[.06] dark:bg-white/[.08]')}>
                  <span>{emoji}</span><span className="text-xs font-semibold">{users.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Computers: quick actions next to the bubble on hover */}
        {!p.sending && (
          <div className="hidden shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 [@media(pointer:fine)]:flex">
            <button type="button" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={t('reply')} onClick={() => p.onReply(m)}><Reply className="size-4" /></button>
            <button type="button" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={t('react')}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); p.onMenu(m, r.left, r.bottom); }}><SmilePlus className="size-4" /></button>
            <button type="button" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={t('more')}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); p.onMenu(m, r.left, r.bottom); }}><MoreHorizontal className="size-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
});
