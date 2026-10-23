'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { MessageCircle, MoreHorizontal, Paperclip, Send, Smile, Download, FileText, Users, SmilePlus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { sendMessageAction, toggleReactionAction } from '@/app/actions/chat';
import { formatBytes, formatTime } from '@/lib/format';
import { MAX_FILE_BYTES } from '@/lib/limits';
import { uploadFile } from '@/lib/upload';
import type { FileMeta, Message } from '@/lib/data/types';
import { useShell } from '@/components/shell/ShellContext';
import { onNewMessage } from '@/lib/live-messages';

const QUICK = ['👍', '🔥', '❤️', '😂', '🎉', '👏'];
const EMOJI = ['😀', '😂', '😍', '🤔', '😎', '😴', '😢', '😡', '👍', '👌', '🙏', '🔥', '❤️', '🎉', '✅', '🚀', '☕', '💡'];

const PENDING = 'pending:';
const byTime = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt);

export function ChatPanel({ channel = 'team', messages: saved, files, title, className }: {
  channel?: string; messages: Message[]; files: FileMeta[]; title?: string; className?: string;
}) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // Messages not yet in the server data: our own while sending (and once saved) and others' from Realtime.
  // They show at once; the next page refresh brings them in `saved` and the local copies are dropped.
  const [local, setLocal] = useState<Message[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => onNewMessage((m) => {
    if (m.channel !== channel) return;
    setLocal((l) => {
      if (l.some((x) => x.id === m.id)) return l;
      // Our own message can arrive here before the send finishes: it takes the place of its "sending" copy.
      const own = m.authorId === user.id ? l.findIndex((x) => x.id.startsWith(PENDING) && x.body === m.body && x.fileId === m.fileId) : -1;
      return own < 0 ? [...l, m] : l.map((x, i) => (i === own ? m : x));
    });
  }), [channel, user.id]);
  const savedIds = useMemo(() => new Set(saved.map((m) => m.id)), [saved]);
  useEffect(() => { setLocal((l) => (l.some((m) => savedIds.has(m.id)) ? l.filter((m) => !savedIds.has(m.id)) : l)); }, [savedIds]);
  const messages = useMemo(() => {
    const extra = local.filter((m) => !savedIds.has(m.id));
    return extra.length ? [...saved, ...extra].sort(byTime) : saved;
  }, [saved, local, savedIds]);

  // The list is capped, so follow the newest message id rather than the count.
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastId]);

  // The message shows right away as "sending"; the text comes back if sending fails.
  const send = (body: string, fileId: string | null = null) => {
    setError(null);
    setText('');
    const tempId = `${PENDING}${crypto.randomUUID()}`;
    setLocal((l) => [...l, { id: tempId, channel, authorId: user.id, body: body.trim(), fileId, createdAt: new Date().toISOString(), reactions: [] }]);
    start(async () => {
      const r = await sendMessageAction(channel, body, fileId).catch(() => null);
      if (r?.ok && r.sent) {
        const sent = r.sent;
        // Realtime may have delivered it already.
        setLocal((l) => (l.some((m) => m.id === sent.id) ? l.filter((m) => m.id !== tempId) : l.map((m) => (m.id === tempId ? sent : m))));
        return;
      }
      setLocal((l) => l.filter((m) => m.id !== tempId));
      setText((cur) => cur || body);
      setError(t('sendFailed'));
    });
  };

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) { setError(t('tooLarge')); return; }
    let id: string;
    try { id = await uploadFile(file); } catch { setError(t('uploadFailed')); return; }
    send(text, id);
  };

  const byId = (id: string | null) => profiles.find((p) => p.id === id) ?? null;

  return (
    <section className={clsx('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MessageCircle className="size-5" />{title ?? t('title')}</h2>
        <MoreHorizontal className="size-5 text-muted" />
      </div>
      {channel === 'team' && (
        <div className="px-4 pb-2"><span className="chip gap-1 bg-surface-2 text-muted"><Users className="size-3" />{t('groupChat')}</span></div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2 scrollbar-thin">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('empty')}</p>}
        {messages.map((m) => {
          const author = byId(m.authorId);
          const file = m.fileId ? files.find((f) => f.id === m.fileId) : null;
          const mine = m.authorId === user.id;
          const sending = m.id.startsWith(PENDING);
          const grouped = Object.entries(m.reactions.reduce<Record<string, string[]>>((acc, r) => { (acc[r.emoji] ??= []).push(r.userId); return acc; }, {}));
          return (
            <div key={m.id} className="flex gap-3">
              <Avatar profile={author} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{author?.displayName ?? '—'}</span>
                  <span className="text-[11px] text-muted" dir={sending ? undefined : 'ltr'}>{sending ? t('sending') : formatTime(locale, m.createdAt)}</span>
                </div>
                {m.body && (
                  <div dir="auto" className={clsx('mt-1 whitespace-pre-wrap break-words rounded-2xl rounded-ss-md px-3 py-2 text-sm leading-6', mine ? 'bg-brand-soft' : 'bg-surface-2', sending && 'opacity-60')}>{m.body}</div>
                )}
                {file && (
                  <a href={`/api/files/${file.id}`} className="mt-1 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:bg-surface-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand"><FileText className="size-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" dir="ltr">{file.name}</span><span className="text-xs text-brand">{formatBytes(locale, file.size)}</span></span>
                    <Download className="size-5 text-muted" />
                  </a>
                )}
                {!sending && <div className="mt-1 flex flex-wrap items-center gap-1">
                  {grouped.map(([emoji, users]) => (
                    <button key={emoji} type="button" onClick={() => start(async () => { await toggleReactionAction(m.id, emoji); })}
                      className={clsx('chip gap-1 border', users.includes(user.id) ? 'border-brand bg-brand-soft' : 'border-line bg-surface')}>
                      {emoji} <span>{users.length}</span>
                    </button>
                  ))}
                  <div className="relative">
                    <button type="button" aria-label={t('react')} onClick={() => setReactFor(reactFor === m.id ? null : m.id)} className="rounded-full p-1 text-muted hover:bg-surface-2"><SmilePlus className="size-4" /></button>
                    {reactFor === m.id && (
                      <div className="card absolute bottom-8 start-0 z-10 flex gap-1 p-1">
                        {QUICK.map((e) => (
                          <button key={e} type="button" className="rounded-lg p-1.5 text-lg hover:bg-surface-2"
                            onClick={() => { setReactFor(null); start(async () => { await toggleReactionAction(m.id, e); }); }}>{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>}
              </div>
            </div>
          );
        })}
      </div>
      <form className="relative border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(text); }}>
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        {emojiOpen && (
          <div className="card absolute bottom-full start-3 mb-2 grid grid-cols-6 gap-1 p-2">
            {EMOJI.map((e) => <button key={e} type="button" className="rounded-lg p-1.5 text-lg hover:bg-surface-2" onClick={() => { setText((x) => x + e); setEmojiOpen(false); }}>{e}</button>)}
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} dir="auto" placeholder={t('placeholder')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send(text); } }}
          className="input min-h-16 resize-none py-2" />
        <div className="mt-2 flex items-center gap-1">
          <button type="button" className="icon-btn" aria-label={t('emoji')} onClick={() => setEmojiOpen((x) => !x)}><Smile className="size-5" /></button>
          <button type="button" className="icon-btn" aria-label={t('attach')} onClick={() => fileInput.current?.click()}><Paperclip className="size-5" /></button>
          <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <button className="ms-auto flex size-11 items-center justify-center rounded-full bg-brand text-brand-ink disabled:opacity-50" disabled={!text.trim()} aria-label={t('placeholder')}>
            <Send className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      </form>
    </section>
  );
}
