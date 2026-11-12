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
const ONLINE_MS = 5000;
const NAME_COLORS = ['#ffd27a', '#c9a2ff', '#7fe0d2', '#ffab91', '#9cc8ff', '#b8e986']; // a teammate counts as here while their position keeps arriving

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
  // Warm grey frosted glass (as in the owner's reference picture), the 3D office showing softly through.
  const glass = 'border border-white/10 bg-[#46423c]/70 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150';
  // Each member's name in their own light colour.
  const nameColor = (id: string | null) => NAME_COLORS[Math.max(0, profiles.findIndex((p) => p.id === id)) % NAME_COLORS.length];

  return (
    // The visible part of the screen: all of it, or what is left above the keyboard (lib/viewport.ts).
    <section aria-label={t('title')}
      className="pointer-events-none fixed inset-x-0 top-[var(--vv-top,0px)] z-40 flex h-[var(--vvh,100dvh)] flex-col gap-3 px-safe pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] text-white in-[.gc-kb]:pb-2 roomy:items-start roomy:justify-end roomy:pb-4">
      {/* Outside the chat: a tap closes it (the office buttons come back). */}
      <div aria-hidden className="pointer-events-auto absolute inset-0"
        onPointerDown={(e) => { e.preventDefault(); onClose(); }} />

      <div className={clsx('pointer-events-auto relative flex min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem]', glass,
        'max-h-[60%] short:w-[min(22rem,40vw)] short:max-h-[62%] in-[.gc-kb]:max-h-full roomy:w-[24rem] roomy:max-h-[min(28rem,100%)]')}>
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-white/10 ps-4 pe-1.5">
          <MessageCircle className="size-6 shrink-0 text-[#6fd6e3]" strokeWidth={1.75} />
          <h2 className="truncate text-base font-bold">{t('title')}</h2>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-white/55"><span className="size-2 rounded-full bg-[#3ee07a]" />{t('online', { n: online })}</span>
          <button type="button" onClick={() => setCollapsed((x) => !x)} aria-expanded={!collapsed} aria-label={collapsed ? t('expand') : t('collapse')} title={collapsed ? t('expand') : t('collapse')}
            className="ms-auto flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full hover:bg-white/10">
            <ChevronDown className={clsx('size-5 transition-transform', collapsed && 'rotate-180')} />
          </button>
          <button type="button" onClick={onClose} aria-label={tc('close')} className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full hover:bg-white/10"><X className="size-5" /></button>
        </header>
        {!collapsed && (
          <div ref={list} className="min-h-12 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 scrollbar-thin">
            {messages.length === 0 && <p className="py-4 text-center text-xs text-white/60">{t('empty')}</p>}
            {messages.map((m, i) => {
              const author = byId(m.authorId);
              const sending = m.id.startsWith(PENDING);
              const prev = messages[i - 1];
              const grouped = !!prev && prev.authorId === m.authorId && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS;
              const mine = m.authorId === meId;
              return (
                <div key={m.id} className={clsx('flex gap-3', grouped ? 'mt-1.5' : 'mt-4 first:mt-0', sending && 'opacity-60')}>
                  {grouped ? <span className="w-10 shrink-0" /> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/models/thumbs/${author?.characterId ?? 'kaykit-mage'}.webp`} alt="" className="size-10 shrink-0 rounded-full bg-[#f6e3cf] object-cover ring-2 ring-white/25" />
                  )}
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <div className="mb-1 flex items-baseline gap-2 text-sm leading-5">
                        <span className="truncate font-bold" style={{ color: nameColor(m.authorId) }}>{author?.displayName ?? '—'}</span>
                        <span className="shrink-0 text-xs text-white/50" dir="ltr">{formatTime(locale, m.createdAt)}</span>
                      </div>
                    )}
                    <div className={clsx('inline-flex max-w-full items-end gap-3 rounded-2xl bg-white/[0.09] px-3.5 py-2', mine && 'ring-1 ring-white/10')}>
                      <p dir="auto" className="min-w-0 text-sm leading-6 break-words whitespace-pre-wrap text-white">{m.body || '📎'}</p>
                      <span className="shrink-0 text-[11px] text-white/45" dir={sending ? undefined : 'ltr'}>{sending ? t('sending') : formatTime(locale, m.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {typingNames.length > 0 && (
          <p className="flex shrink-0 items-center gap-2 truncate px-4 pb-2.5 text-xs text-white/75">
            <span className="flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-pulse rounded-full bg-white/60" style={{ animationDelay: `${d * 200}ms` }} />)}</span>
            {to('typing', { name: typingNames.join(locale === 'fa' ? '، ' : ', ') })}
          </p>
        )}
      </div>

      {/* Room between the card and the writing bar: part of "outside". */}
      <div className="min-h-0 flex-1 roomy:hidden" />

      {error && <p className="pointer-events-auto relative self-start rounded-full bg-[#d9443c]/90 px-3 py-1 text-xs" role="alert">{t('sendFailed')}</p>}
      <form className="pointer-events-auto relative flex w-full shrink-0 items-end gap-2 roomy:w-[24rem]" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {emojiOpen && (
          <div className={clsx('absolute start-0 bottom-full mb-2 grid grid-cols-6 gap-1 rounded-2xl p-2', glass)}>
            {EMOJI.map((e) => (
              <button key={e} type="button" className="rounded-lg p-1.5 text-xl hover:bg-white/10"
                onClick={() => { setText((x) => x + e); setEmojiOpen(false); field.current?.focus(); }}>{e}</button>
            ))}
          </div>
        )}
        <div className={clsx('flex min-w-0 flex-1 items-end gap-1 rounded-[1.75rem] p-1', glass)}>
          <button type="button" aria-label={t('emoji')} aria-expanded={emojiOpen} onClick={() => setEmojiOpen((x) => !x)}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-white hover:bg-white/10"><Smile className="size-7" strokeWidth={1.75} /></button>
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
            className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-6 text-white placeholder:text-white/50 focus:outline-none" />
        </div>
        {/* Keeps the field focused (and the keyboard up) when sending with a tap. */}
        <button type="submit" disabled={!text.trim()} aria-label={tc('send')} onPointerDown={(e) => e.preventDefault()}
          className={clsx('flex size-[3.25rem] shrink-0 touch-manipulation items-center justify-center rounded-full text-white transition active:scale-95', glass, text.trim() && 'bg-[#2f8f7a]/90')}>
          <Send className="size-6 fill-current rtl:-scale-x-100" strokeWidth={1.5} />
        </button>
      </form>
    </section>
  );
}
