'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { MessageCircle, Send, Smile, X } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Message, Profile } from '@/lib/data/types';
import { PENDING } from '@/components/chat/useChat';
import { EMOJI } from '@/components/chat/ChatPanel';
import type { RemoteAvatar } from './useOfficeNet';
import { useLabelsVersion } from './labels';

const MAX_LINES_PX = 96; // the field grows to about three lines

// Height of the on-screen keyboard (phones), so the panel sits on top of it instead of under it.
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) { setInset(0); return; }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, [active]);
  return inset;
}

// Team chat inside the 3D office: a compact panel at the start side on computers (Enter or T opens it,
// Enter sends, Enter on an empty line or Esc closes) and a sheet above the keyboard on phones.
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
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const kb = useKeyboardInset(focused);

  useEffect(() => { if (focusKey) field.current?.focus({ preventScroll: true }); }, [focusKey]);
  // Who is writing right now ("typing…" signals expire, so this looks again every second).
  useLabelsVersion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const typingNames = profiles.filter((p) => p.id !== meId && (remotes.current.get(p.id)?.typing ?? 0) > now).map((p) => p.displayName);
  const lastId = messages.at(-1)?.id;
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [lastId, kb]);
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

  return (
    <section aria-label={t('title')} style={{ '--kb': `${kb}px` } as React.CSSProperties}
      className={clsx('pointer-events-auto absolute z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#13201a]/85 text-white shadow-2xl backdrop-blur-md',
        'inset-x-2 bottom-[calc(var(--kb)+max(0.5rem,env(safe-area-inset-bottom)))] max-h-[min(50dvh,calc(100dvh-var(--kb)-5.5rem))]',
        'sm:inset-x-auto sm:start-3 sm:bottom-[calc(var(--kb)+1rem)] sm:w-[22rem] sm:max-h-[min(26rem,calc(100dvh-var(--kb)-6rem))]',
        'short:inset-x-auto short:start-2 short:bottom-[calc(var(--kb)+0.5rem)] short:w-[min(21rem,60vw)] short:max-h-[calc(100dvh-var(--kb)-4rem)]')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 ps-3 pe-1">
        <MessageCircle className="size-4 text-[#7fd0c2]" />
        <h2 className="me-auto truncate text-sm font-bold">{t('title')}</h2>
        <button type="button" onClick={onClose} aria-label={tc('close')} className="flex size-10 touch-manipulation items-center justify-center rounded-xl hover:bg-white/10"><X className="size-4" /></button>
      </header>
      <div ref={list} className="min-h-16 flex-1 space-y-2.5 overflow-y-auto px-3 py-2 scrollbar-thin">
        {messages.length === 0 && <p className="py-4 text-center text-xs text-white/60">{t('empty')}</p>}
        {messages.map((m) => {
          const author = byId(m.authorId);
          const sending = m.id.startsWith(PENDING);
          return (
            <div key={m.id} className={clsx('flex gap-2', sending && 'opacity-60')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/models/thumbs/${author?.characterId ?? 'kaykit-mage'}.webp`} alt="" className="mt-0.5 size-7 shrink-0 rounded-full bg-[#f6e3cf] object-cover ring-2 ring-white/20" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-[11px] leading-4">
                  <span className={clsx('truncate font-bold', m.authorId === meId ? 'text-[#7fd0c2]' : 'text-[#ffd98a]')}>{author?.displayName ?? '—'}</span>
                  <span className="shrink-0 text-white/45" dir={sending ? undefined : 'ltr'}>{sending ? t('sending') : formatTime(locale, m.createdAt)}</span>
                </div>
                <p dir="auto" className="text-sm leading-6 break-words whitespace-pre-wrap text-white/95">{m.body || '📎'}</p>
              </div>
            </div>
          );
        })}
      </div>
      {typingNames.length > 0 && (
        <p className="shrink-0 truncate px-3 pb-1 text-[11px] text-white/65">{to('typing', { name: typingNames.join(locale === 'fa' ? '، ' : ', ') })}</p>
      )}
      {error && <p className="shrink-0 px-3 pb-1 text-xs text-[#ffb4a8]" role="alert">{t('sendFailed')}</p>}
      <form className="relative flex shrink-0 items-end gap-1 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {emojiOpen && (
          <div className="absolute start-2 bottom-full mb-2 grid grid-cols-6 gap-1 rounded-xl bg-[#13201a] p-2 shadow-xl ring-1 ring-white/10">
            {EMOJI.map((e) => (
              <button key={e} type="button" className="rounded-lg p-1.5 text-lg hover:bg-white/10"
                onClick={() => { setText((x) => x + e); setEmojiOpen(false); field.current?.focus(); }}>{e}</button>
            ))}
          </div>
        )}
        <button type="button" aria-label={t('emoji')} onClick={() => setEmojiOpen((x) => !x)}
          className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-xl text-white/80 hover:bg-white/10"><Smile className="size-5" /></button>
        <textarea ref={field} value={text} rows={1} dir="auto" enterKeyHint="send" placeholder={t('placeholder')} maxLength={4000}
          onChange={(e) => { setText(e.target.value); onTyping(!!e.target.value.trim()); }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onTyping(false); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (text.trim()) send(); else onClose();
            }
          }}
          className="min-h-10 flex-1 resize-none rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[16px] leading-6 text-white placeholder:text-white/45 focus:border-[#7fd0c2] focus:outline-none sm:text-sm" />
        <button type="submit" disabled={!text.trim()} aria-label={tc('send')}
          className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-[#2f8f7a] text-white transition active:scale-95 disabled:opacity-40">
          <Send className="size-4 rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}
