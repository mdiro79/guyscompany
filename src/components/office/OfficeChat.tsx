'use client';
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, CornerUpLeft, MessageCircle, Mic, Send, Smile, Trash2, X } from 'lucide-react';
import { formatTime } from '@/lib/format';
import type { Message, Profile, Reaction } from '@/lib/data/types';
import { PENDING } from '@/components/chat/useChat';
import { EMOJI } from '@/components/chat/ChatPanel';
import { VoicePlayer, ago, clockOf, useVoiceRecorder, voiceBody, voiceSeconds } from '@/components/chat/voice';
import { toggleReactionAction } from '@/app/actions/chat';
import { uploadFile } from '@/lib/upload';
import { MAX_FILE_BYTES } from '@/lib/limits';
import type { RemoteAvatar } from './useOfficeNet';
import { useLabelsVersion } from './labels';
import { useKeyboardOpen } from '@/lib/viewport';

const MAX_LINES_PX = 96; // the field grows to about three lines
const GROUP_MS = 5 * 60_000; // messages of one person this close together share one name and picture
const ONLINE_MS = 5000; // a teammate counts as here while their position keeps arriving
const NAME_COLORS = ['#ffd27a', '#c9a2ff', '#7fe0d2', '#ffab91', '#9cc8ff', '#b8e986'];
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥'];

// Team chat inside the 3D office, like a messenger. It fills the part of the screen that is visible
// (above a phone's keyboard, gliding with it):
//  - tall screens: the messages in a card at the top (above the writing bar on computers);
//  - a phone held sideways: a slim strip of messages scrolling sideways, newest on the right, each with
//    "now" / "5 min ago" above it; it stays the same with the keyboard up or down;
//  - a wide writing bar at the bottom, right on top of the keyboard; with nothing typed its button
//    records a voice message instead.
// Tapping a message opens its menu: a reaction, or a reply (text or voice) that quotes it.
// While the chat is open the office's other buttons fade away (see .gc-hud); a tap anywhere outside
// closes it and they come back. On computers Enter or T opens it, Enter sends, Enter on an empty line or
// Esc closes. Messages also appear above the writer's head; "typing…" shows above it while they write.
export function OfficeChat({ messages, profiles, meId, remotes, onSend, onTyping, onClose, focusKey }: {
  messages: Message[]; profiles: Profile[]; meId: string; remotes: React.RefObject<Map<string, RemoteAvatar>>;
  onSend: (body: string, fileId?: string | null, replyTo?: string | null) => Promise<boolean>; onTyping: (on: boolean) => void; onClose: () => void;
  focusKey: number; // the field takes the focus whenever this changes (0: never, e.g. phones, where the tap opens the keyboard)
}) {
  const t = useTranslations('chat');
  const to = useTranslations('office');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null); // the message whose menu (react, reply) is open
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // My reactions show at once; the saved ones replace them when the message's reactions next change.
  const [reacted, setReacted] = useState<Record<string, { base: Reaction[]; list: Reaction[] }>>({});
  const [, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const kb = useKeyboardOpen();

  useEffect(() => { if (focusKey) field.current?.focus({ preventScroll: true }); }, [focusKey]);
  // Who is writing and who is here right now ("typing…" signals expire, so this looks again every second).
  useLabelsVersion();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const typingNames = profiles.filter((p) => p.id !== meId && (remotes.current.get(p.id)?.typing ?? 0) > now).map((p) => p.displayName);
  const online = 1 + [...remotes.current.values()].filter((r) => r.userId !== meId && performance.now() - r.receivedAt < ONLINE_MS).length;
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
    // The strip always runs left to right: the newest message is at its right end.
    const el = strip.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [lastId, kb, collapsed]);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_LINES_PX, el.scrollHeight)}px`;
  }, [text]);
  useEffect(() => () => onTyping(false), [onTyping]);

  const byId = (id: string | null) => profiles.find((p) => p.id === id);
  const msgById = (id: string | null | undefined) => (id ? messages.find((m) => m.id === id) ?? null : null);
  const nameColor = (id: string | null) => NAME_COLORS[Math.max(0, profiles.findIndex((p) => p.id === id)) % NAME_COLORS.length];
  const reactionsOf = (m: Message) => { const r = reacted[m.id]; return r && r.base === m.reactions ? r.list : m.reactions; };
  const snippet = (m: Message) => (voiceSeconds(m) !== null ? `🎤 ${t('voice')}` : m.body || '📎');

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const answer = replyTo;
    setError(null);
    setText('');
    setReplyTo(null);
    onTyping(false);
    void onSend(body, null, answer).then((ok) => {
      if (ok) return;
      setText((cur) => cur || body);
      setReplyTo((r) => r ?? answer);
      setError(t('sendFailed'));
    });
  };

  const voice = useVoiceRecorder(async (file, seconds) => {
    if (file.size > MAX_FILE_BYTES) { setError(t('tooLarge')); return; }
    const answer = replyTo;
    setReplyTo(null);
    setUploading(true);
    try {
      const fileId = await uploadFile(file);
      if (!(await onSend(voiceBody(seconds), fileId, answer))) throw new Error('send');
    } catch {
      setReplyTo((r) => r ?? answer);
      setError(t('voiceFailed'));
    } finally { setUploading(false); }
  }, () => setError(t('micDenied')));
  const recording = voice.state !== 'idle';

  const react = (m: Message, emoji: string) => {
    setMenuFor(null);
    const list = reactionsOf(m);
    const has = list.some((r) => r.userId === meId && r.emoji === emoji);
    setReacted((x) => ({ ...x, [m.id]: { base: m.reactions, list: has ? list.filter((r) => !(r.userId === meId && r.emoji === emoji)) : [...list, { userId: meId, emoji }] } }));
    start(async () => { await toggleReactionAction(m.id, emoji).catch(() => null); });
  };
  const openMenu = (m: Message) => { if (!m.id.startsWith(PENDING)) setMenuFor((x) => (x === m.id ? null : m.id)); };
  const menuMsg = msgById(menuFor);
  const replyMsg = msgById(replyTo);

  // Reactions under a message: each emoji with how many, mine highlighted (tap to toggle).
  const reactionChips = (m: Message, small = false) => {
    const grouped = Object.entries(reactionsOf(m).reduce<Record<string, string[]>>((acc, r) => { (acc[r.emoji] ??= []).push(r.userId); return acc; }, {}));
    if (!grouped.length) return null;
    return (
      <span className={clsx('flex flex-wrap gap-1', small ? 'mt-0.5' : 'mt-1')}>
        {grouped.map(([emoji, users]) => (
          <button key={emoji} type="button" onClick={(e) => { e.stopPropagation(); react(m, emoji); }}
            className={clsx('flex items-center gap-0.5 rounded-full px-1.5 leading-5 transition active:scale-90', small ? 'text-[11px]' : 'text-xs',
              users.includes(meId) ? 'bg-[#2f8f7a]/70 ring-1 ring-[#7fe0d2]/60' : 'bg-black/30')}>
            {emoji}{users.length > 1 && <span className="tabular-nums">{users.length}</span>}
          </button>
        ))}
      </span>
    );
  };
  // The quoted message at the top of a reply.
  const quote = (m: Message, light = false) => {
    const q = msgById(m.replyTo);
    if (!m.replyTo) return null;
    return (
      <span className={clsx('mb-1 block max-w-full truncate border-s-2 ps-2 text-xs leading-4', light ? 'border-[#2b241e]/40 text-[#2b241e]/70' : 'border-white/40 text-white/65')} dir="auto">
        <b style={light ? undefined : { color: nameColor(q?.authorId ?? null) }}>{q ? byId(q.authorId)?.displayName ?? '—' : '…'}</b> {q ? snippet(q) : ''}
      </span>
    );
  };
  // The text or the voice player of a message.
  const content = (m: Message, light: boolean, compact: boolean) => {
    const secs = voiceSeconds(m);
    if (secs !== null && m.fileId) return <VoicePlayer fileId={m.fileId} seconds={secs} light={light} compact={compact} />;
    return <span dir="auto" className={clsx('min-w-0 text-sm', compact ? 'truncate' : 'leading-6 break-words whitespace-pre-wrap')}>{m.body || '📎'}</span>;
  };

  const glass = 'border border-white/10 bg-[#46423c]/70 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150';
  const canSend = !!text.trim();

  return (
    // The visible part of the screen: all of it, or what is left above the keyboard (lib/viewport.ts).
    <section aria-label={t('title')}
      className="pointer-events-none fixed inset-x-0 top-[var(--vv-top,0px)] z-40 flex h-[var(--vvh,100dvh)] flex-col gap-3 px-safe pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] text-white transition-[top,height] duration-300 ease-[cubic-bezier(0.2,0.85,0.25,1)] motion-reduce:transition-none in-[.gc-kb]:pb-2 short:gap-2 short:pt-2 roomy:items-start roomy:justify-end roomy:pb-4">
      {/* Outside the chat: a tap closes the message menu, or else the chat (the office buttons come back). */}
      <div aria-hidden className="pointer-events-auto absolute inset-0"
        onPointerDown={(e) => { e.preventDefault(); if (menuFor || emojiOpen) { setMenuFor(null); setEmojiOpen(false); } else onClose(); }} />

      {/* Tall screens: the card */}
      <div className={clsx('pointer-events-auto relative flex min-h-0 w-full flex-col overflow-hidden rounded-[1.75rem] short:hidden', glass,
        'max-h-[60%] in-[.gc-kb]:max-h-full roomy:w-[24rem] roomy:max-h-[min(28rem,100%)]')}>
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
              return (
                <div key={m.id} className={clsx('flex gap-3', grouped ? 'mt-1.5' : 'mt-4 first:mt-0', i === messages.length - 1 && 'gc-pop', sending && 'opacity-60')}>
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
                    <div role="button" tabIndex={0} onClick={() => openMenu(m)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(m); } }}
                      className={clsx('inline-flex max-w-full cursor-pointer flex-col items-stretch rounded-2xl bg-white/[0.09] px-3.5 py-2 text-start transition active:scale-[0.98]',
                        menuFor === m.id && 'ring-2 ring-[#7fe0d2]/70', m.authorId === meId && menuFor !== m.id && 'ring-1 ring-white/10')}>
                      {quote(m)}
                      <span className="flex items-end gap-3">
                        {content(m, false, false)}
                        <span className="shrink-0 text-[11px] text-white/45" dir={sending ? undefined : 'ltr'}>{sending ? t('sending') : formatTime(locale, m.createdAt)}</span>
                      </span>
                    </div>
                    {reactionChips(m)}
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

      {/* Phone held sideways: one slim strip, newest on the right, with how long ago above each message. */}
      <div ref={strip} dir="ltr" className={clsx('pointer-events-auto relative hidden min-h-0 shrink-0 items-end gap-2 overflow-x-auto overscroll-contain scroll-smooth rounded-[1.75rem] px-2 pt-1 pb-1.5 [scrollbar-width:none] short:flex', glass)}>
        {messages.length === 0 && <p className="px-3 py-2 text-xs text-white/60">{t('empty')}</p>}
        {messages.slice(-20).map((m, i, shown) => {
          const mine = m.authorId === meId;
          const author = byId(m.authorId);
          const sending = m.id.startsWith(PENDING);
          return (
            <div key={m.id} className={clsx('flex shrink-0 flex-col', mine ? 'items-end' : 'items-start', i === shown.length - 1 && 'gc-pop', sending && 'opacity-60')}>
              <span className="px-11 text-[10px] leading-4 text-white/60">{sending ? t('sending') : ago(locale, m.createdAt, now)}</span>
              <div className={clsx('flex items-center gap-1.5', mine && 'flex-row-reverse')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/models/thumbs/${author?.characterId ?? 'kaykit-mage'}.webp`} alt="" title={author?.displayName} className="size-9 shrink-0 rounded-full bg-[#f6e3cf] object-cover ring-2 ring-white/25" />
                <div role="button" tabIndex={0} onClick={() => openMenu(m)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMenu(m); } }} dir={locale === 'fa' ? 'rtl' : 'ltr'}
                  className={clsx('relative flex max-w-[16rem] cursor-pointer flex-col rounded-[1.1rem] px-3 py-1.5 text-start transition active:scale-95',
                    mine ? 'bg-[#f3e2c4]/95 text-[#2b241e]' : 'bg-black/25 text-white', menuFor === m.id && 'ring-2 ring-[#7fe0d2]')}>
                  {m.replyTo && quote(m, mine)}
                  {content(m, mine, true)}
                  {reactionChips(m, true)}
                </div>
              </div>
            </div>
          );
        })}
        {typingNames.length > 0 && (
          <span className="mb-1 flex shrink-0 items-center gap-1 rounded-full bg-black/25 px-3 py-2.5" title={to('typing', { name: typingNames.join(', ') })}>
            {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-pulse rounded-full bg-white/70" style={{ animationDelay: `${d * 200}ms` }} />)}
          </span>
        )}
      </div>

      {/* Room between the messages and the writing bar: part of "outside". */}
      <div className="min-h-0 flex-1 roomy:hidden" />

      {error && <p className="pointer-events-auto relative self-start rounded-full bg-[#d9443c]/90 px-3 py-1 text-xs" role="alert">{error}</p>}
      <form className="pointer-events-auto relative flex w-full shrink-0 items-end gap-2 roomy:w-[24rem]" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {/* A message's menu: a reaction, or reply to it. */}
        {menuMsg && (
          <div className={clsx('gc-pop absolute start-0 bottom-full z-10 mb-2 flex max-w-full items-center gap-0.5 rounded-full p-1', glass, 'bg-[#2e2b27]/90')}>
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => react(menuMsg, e)} aria-pressed={reactionsOf(menuMsg).some((r) => r.userId === meId && r.emoji === e)}
                className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-white/10 active:scale-90 aria-pressed:bg-white/20">{e}</button>
            ))}
            <span className="mx-1 h-6 w-px shrink-0 bg-white/15" />
            <button type="button" onClick={() => { setReplyTo(menuMsg.id); setMenuFor(null); field.current?.focus(); }}
              className="flex h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
              <CornerUpLeft className="size-4 rtl:-scale-x-100" />{t('reply')}
            </button>
          </div>
        )}
        {emojiOpen && (
          <div className={clsx('gc-pop absolute start-0 bottom-full z-10 mb-2 grid grid-cols-6 gap-1 rounded-2xl p-2', glass)}>
            {EMOJI.map((e) => (
              <button key={e} type="button" className="rounded-lg p-1.5 text-xl hover:bg-white/10"
                onClick={() => { setText((x) => x + e); setEmojiOpen(false); field.current?.focus(); }}>{e}</button>
            ))}
          </div>
        )}
        <div className={clsx('flex min-w-0 flex-1 flex-col rounded-[1.75rem] p-1', glass)}>
          {replyMsg && (
            <div className="gc-pop flex items-center gap-2 border-b border-white/10 py-1 ps-3 pe-1">
              <CornerUpLeft className="size-4 shrink-0 text-[#7fe0d2] rtl:-scale-x-100" />
              <span className="min-w-0 flex-1 truncate text-xs" dir="auto">
                <b style={{ color: nameColor(replyMsg.authorId) }}>{t('replyTo', { name: byId(replyMsg.authorId)?.displayName ?? '—' })}</b>
                <span className="text-white/65"> · {snippet(replyMsg)}</span>
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t('cancelReply')} className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10"><X className="size-4" /></button>
            </div>
          )}
          {recording ? (
            // Recording: a red dot, the time and a bin to throw it away.
            <div className="flex min-h-11 items-center gap-2 ps-2 pe-1">
              <span className="size-3 animate-pulse rounded-full bg-[#ff4d4d]" />
              <span className="text-sm tabular-nums" dir="ltr">{clockOf(voice.seconds)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-white/65">{t('recording')}…</span>
              <button type="button" onClick={() => voice.stop(false)} aria-label={t('cancelRecording')} title={t('cancelRecording')}
                className="flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-[#ff8a80] hover:bg-white/10"><Trash2 className="size-5" /></button>
            </div>
          ) : (
            <div className="flex items-end gap-1">
              <button type="button" aria-label={t('emoji')} aria-expanded={emojiOpen} onClick={() => { setEmojiOpen((x) => !x); setMenuFor(null); }}
                className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-white hover:bg-white/10"><Smile className="size-7" strokeWidth={1.75} /></button>
              {/* No word suggestions above the keyboard: they take a whole row of the little room left on a phone. */}
              <textarea ref={field} value={text} rows={1} dir="auto" enterKeyHint="send" placeholder={uploading ? `${t('voice')}…` : t('placeholder')} maxLength={4000}
                autoComplete="off" autoCorrect="off" spellCheck={false}
                onChange={(e) => { setText(e.target.value); onTyping(!!e.target.value.trim()); }}
                onBlur={() => onTyping(false)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') { e.preventDefault(); if (replyTo) setReplyTo(null); else onClose(); return; }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (text.trim()) send(); else onClose();
                  }
                }}
                className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-6 text-white placeholder:text-white/50 focus:outline-none" />
            </div>
          )}
        </div>
        {/* Send when there is text (keeps the keyboard up); otherwise record a voice message, tap again to send it. */}
        {canSend || recording ? (
          <button type={recording ? 'button' : 'submit'} onClick={recording ? () => voice.stop(true) : undefined} onPointerDown={(e) => e.preventDefault()}
            aria-label={recording ? t('sendVoice') : tc('send')}
            className="gc-pop flex size-[3.25rem] shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#2f8f7a] text-white shadow-[0_10px_40px_rgba(0,0,0,0.35)] transition active:scale-90">
            <Send className="size-6 fill-current rtl:-scale-x-100" strokeWidth={1.5} />
          </button>
        ) : (
          <button type="button" onClick={() => { setError(null); setEmojiOpen(false); setMenuFor(null); void voice.start(); }} disabled={uploading || voice.state === 'starting'}
            aria-label={t('record')} title={t('record')}
            className={clsx('gc-pop flex size-[3.25rem] shrink-0 touch-manipulation items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-50', glass)}>
            <Mic className="size-6" strokeWidth={1.75} />
          </button>
        )}
      </form>
    </section>
  );
}
