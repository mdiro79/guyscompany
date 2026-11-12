'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, MessageCircle, Send, Smile, X } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Message, Profile } from '@/lib/data/types';
import { PENDING } from '@/components/chat/useChat';
import { EMOJI } from '@/components/chat/ChatPanel';
import type { RemoteAvatar } from './useOfficeNet';
import { useLabelsVersion } from './labels';
import { useKeyboardOpen } from '@/lib/viewport';

const MAX_LINES_PX = 96; // the field grows to about three lines
const GROUP_MS = 5 * 60_000; // messages of one person this close together share one name and picture
const ONLINE_MS = 5000; // a teammate counts as here while their position keeps arriving

// Team chat inside the 3D office. It fills the part of the screen that is visible (above a phone's
// keyboard): the messages in a card at the top (the start side on a phone held sideways; above the
// writing bar on computers) and a wide writing bar at the bottom, right on top of the keyboard. While it
// is open the office's other buttons fade away (see .gc-hud); a tap anywhere outside closes it and they
// come back. On computers Enter or T opens it, Enter sends, Enter on an empty line or Esc closes.
// Messages also appear above the writer's head; "typing…" shows above it while they write.
export function OfficeChat({ messages, profiles, meId, remotes, onSend, onTyping, onClose, focusKey }: {
  messages: Message[]; profiles: Profile[]; meId: string; remotes: React.RefObject<Map<string, RemoteAvatar>>;
  onSend: (body: string) => Promise<boolean>; onTyping: (on: boolean) => void; onClose: () => void;
  focusKey: number; // the field takes the focus whenever this changes (0: never, e.g. phones, where the tap opens the keyboard)
}) {
  const t = useTranslations('chat');
  const to = useTranslations('office');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const kb = useKeyboardOpen();

  useEffect(() => { if (focusKey) field.current?.focus({ preventScroll: true }); }, [focusKey]);
  // Who is writing and who is here right now ("typing…" signals expire, so this looks again every second).
  useLabelsVersion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const typingNames = profiles.filter((p) => p.id !== meId && (remotes.current.get(p.id)?.typing ?? 0) > now).map((p) => p.displayName);
  const online = 1 + [...remotes.current.values()].filter((r) => r.userId !== meId && performance.now() - r.receivedAt < ONLINE_MS).length;
  const lastId = messages.at(-1)?.id;
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [lastId, kb, collapsed]);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_LINES_PX, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => () => onTyping(false), [onTyping]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setError(false);
    setText('');
    onTyping(false);
    void onSend(body).then((ok) => {
      if (ok) return;
      setText((cur) => cur || body);
      setError(true);
    });
  };
  const byId = (id: string | null) => profiles.find((p) => p.id === id);
  const glass = 'border border-white/10 bg-[#13201a]/80 shadow-2xl backdrop-blur-md';

  return (
    // The visible part of the screen: all of it, or what is left above the keyboard (lib/viewport.ts).
    <section aria-label={t('title')}
      className="pointer-events-none fixed inset-x-0 top-[var(--vv-top,0px)] z-40 flex h-[var(--vvh,100dvh)] flex-col gap-2 px-safe pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] text-white in-[.gc-kb]:pb-2 roomy:items-start roomy:justify-end roomy:pb-4">
      {/* Outside the chat: a tap closes it (the office buttons come back). */}
      <div aria-hidden className="pointer-events-auto absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/35"
        onPointerDown={(e) => { e.preventDefault(); onClose(); }} />

      <div className={clsx('pointer-events-auto relative flex min-h-0 w-full flex-col overflow-hidden rounded-3xl', glass,
        'max-h-[60%] short:w-[min(24rem,55vw)] short:max-h-full in-[.gc-kb]:max-h-full roomy:w-[24rem] roomy:max-h-[min(26rem,100%)]')}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 ps-3.5 pe-1">
          <MessageCircle className="size-5 shrink-0 text-[#7fd0c2]" />
          <h2 className="truncate text-sm font-bold">{t('title')}</h2>
          <span className="flex shrink-0 items-center gap-1 text-xs text-white/60"><span className="size-2 rounded-full bg-[#3ee07a]" />{t('online', { n: online })}</span>
          <button type="button" onClick={() => setCollapsed((x) => !x)} aria-expanded={!collapsed} aria-label={collapsed ? t('expand') : t('collapse')} title={collapsed ? t('expand') : t('collapse')}
            className="ms-auto flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-xl hover:bg-white/10">
            <ChevronDown className={clsx('size-5 transition-transform', collapsed && 'rotate-180')} />
          </button>
          <button type="button" onClick={onClose} aria-label={tc('close')} className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-xl hover:bg-white/10"><X className="size-5" /></button>
        </header>
        {!collapsed && (
          <div ref={list} className="min-h-12 flex-1 overflow-y-auto overscroll-contain px-3 py-2 scrollbar-thin">
            {messages.length === 0 && <p className="py-4 text-center text-xs text-white/60">{t('empty')}</p>}
            {messages.map((m, i) => {
              const author = byId(m.authorId);
              const sending = m.id.startsWith(PENDING);
              const prev = messages[i - 1];
              const grouped = !!prev && prev.authorId === m.authorId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
              const mine = m.authorId === meId;
              return (
                <div key={m.id} className={clsx('flex gap-2.5', grouped ? 'mt-1' : 'mt-3 first:mt-0', sending && 'opacity-60')}>
                  {grouped ? <span className="w-9 shrink-0" /> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/models/thumbs/${author?.characterId ?? 'kaykit-mage'}.webp`} alt="" className="size-9 shrink-0 rounded-full bg-[#f6e3cf] object-cover ring-2 ring-white/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <div className="mb-0.5 flex items-baseline gap-2 text-xs leading-5">
                        <span className={clsx('truncate font-bold', mine ? 'text-[#7fd0c2]' : 'text-[#ffd98a]')}>{author?.displayName ?? '—'}</span>
                        <span className="shrink-0 text-white/45" dir="ltr">{formatTime(locale, m.createdAt)}</span>
                      </div>
                    )}
                    <div className={clsx('inline-flex max-w-full items-end gap-2 rounded-2xl px-3 py-1.5', grouped ? 'rounded-ss-md' : 'rounded-ss-sm', mine ? 'bg-[#2f8f7a]/35' : 'bg-white/10')}>
                      <p dir="auto" className="min-w-0 text-sm leading-6 break-words whitespace-pre-wrap text-white/95">{m.body || '📎'}</p>
                      <span className="shrink-0 pb-0.5 text-[10px] text-white/45" dir={sending ? undefined : 'ltr'}>{sending ? t('sending') : formatTime(locale, m.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {typingNames.length > 0 && (
          <p className="flex shrink-0 items-center gap-1.5 truncate px-3.5 pb-2 text-[11px] text-white/70">
            <span className="flex gap-0.5">{[0, 1, 2].map((d) => <span key={d} className="size-1 animate-bounce rounded-full bg-white/70" style={{ animationDelay: `${d * 150}ms` }} />)}</span>
            {to('typing', { name: typingNames.join(locale === 'fa' ? '، ' : ', ') })}
          </p>
        )}
      </div>

      {/* Room between the card and the writing bar: part of "outside". */}
      <div className="min-h-0 flex-1 roomy:hidden" />

      {error && <p className="pointer-events-auto relative self-start rounded-full bg-[#d9443c]/90 px-3 py-1 text-xs" role="alert">{t('sendFailed')}</p>}
      <form className="pointer-events-auto relative flex w-full shrink-0 items-end gap-2 roomy:w-[24rem]" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {emojiOpen && (
          <div className={clsx('absolute start-0 bottom-full mb-2 grid grid-cols-6 gap-1 rounded-2xl p-2', glass, 'bg-[#13201a]/95')}>
            {EMOJI.map((e) => (
              <button key={e} type="button" className="rounded-lg p-1.5 text-xl hover:bg-white/10"
                onClick={() => { setText((x) => x + e); setEmojiOpen(false); field.current?.focus(); }}>{e}</button>
            ))}
          </div>
        )}
        <div className={clsx('flex min-w-0 flex-1 items-end gap-1 rounded-[1.6rem] p-1 focus-within:border-[#7fd0c2]/70', glass)}>
          <button type="button" aria-label={t('emoji')} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((x) => !x)}
            className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-white/80 hover:bg-white/10"><Smile className="size-6" /></button>
          <textarea ref={field} value={text} rows={1} dir="auto" enterKeyHint="send" placeholder={t('placeholder')} maxLength={4000}
            onChange={(e) => { setText(e.target.value); onTyping(!!e.target.value.trim()); }}
            onBlur={() => onTyping(false)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (text.trim()) send(); else onClose();
              }
            }}
            className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[16px] leading-6 text-white placeholder:text-white/45 focus:outline-none roomy:text-sm" />
        </div>
        {/* Keeps the field focused (and the keyboard up) when sending with a tap. */}
        <button type="submit" disabled={!text.trim()} aria-label={tc('send')} onPointerDown={(e) => e.preventDefault()}
          className="flex size-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#2f8f7a] text-white shadow-xl transition active:scale-95 disabled:bg-[#13201a]/80 disabled:text-white/50">
          <Send className="size-5 rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}
