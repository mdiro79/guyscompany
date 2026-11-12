'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Paperclip, Send, Smile, X, Mic, Trash2, Reply, Pencil, Loader2, FileText, CalendarClock } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import type { Message, Profile } from '@/lib/data/types';
import { COMMANDS, parseChatCommand, type ChatCommand } from '@/lib/chat';
import { formatDate, formatBytes } from '@/lib/format';
import { MAX_FILE_BYTES } from '@/lib/limits';
import { PriorityChip, LEVEL4_STYLE, OptionChip } from '@/components/icons/options';
import { EMOJI } from './emoji';
import { nameColor } from './MessageItem';

const COMMAND_ICON = { task: '✅', bug: '🐞', decision: '⚖️' } as const;
const DRAFT_KEY = (c: string) => `gc-draft:${c}`;
const MIME_CHOICES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export interface ComposerProps {
  channel: string;
  profiles: Profile[];
  meId: string;
  today: string;
  reply: Message | null;
  replyAuthor: Profile | null;
  replyPreview: string;
  editing: Message | null;
  canBug: boolean; // bugs need a project (a project topic)
  onCancel: () => void;
  onSend: (text: string, file: File | null) => Promise<boolean>;
  onSaveEdit: (text: string) => void;
  onCommand: (c: ChatCommand) => void;
  onTyping: (on: boolean) => void;
  onEditLast: () => void;
  error: string | null;
}

// The writing bar at the bottom of a chat.
export function Composer(p: ComposerProps) {
  const t = useTranslations('chatPage');
  const locale = useLocale();
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ file: File; url: string | null } | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [rec, setRec] = useState<{ since: number } | null>(null);
  const [now, setNow] = useState(0);
  const [mentionAt, setMentionAt] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<{ r: MediaRecorder; chunks: Blob[]; send: boolean; mime: string } | null>(null);
  const [coarse, setCoarse] = useState(false);
  useEffect(() => { setCoarse(window.matchMedia('(pointer: coarse)').matches); }, []);

  // Each chat keeps its unsent text on this device.
  useEffect(() => {
    try { setText(localStorage.getItem(DRAFT_KEY(p.channel)) ?? ''); } catch { /* storage blocked */ }
  }, [p.channel]);
  useEffect(() => {
    if (p.editing) return;
    const id = setTimeout(() => { try { if (text) localStorage.setItem(DRAFT_KEY(p.channel), text); else localStorage.removeItem(DRAFT_KEY(p.channel)); } catch { /* storage blocked */ } }, 300);
    return () => clearTimeout(id);
  }, [text, p.channel, p.editing]);

  // Editing puts the message's text in the field; replying focuses it.
  const editId = p.editing?.id;
  useEffect(() => { if (p.editing) { setText(p.editing.body); requestAnimationFrame(() => area.current?.focus()); } }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.reply) area.current?.focus({ preventScroll: true }); }, [p.reply]);

  // Grows with the text up to about six lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  useEffect(() => { if (!rec) return; const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, [rec]);
  useEffect(() => () => { if (file?.url) URL.revokeObjectURL(file.url); }, [file]);

  const command = useMemo(() => (text.startsWith('/') ? parseChatCommand(text, p.today, p.profiles) : null), [text, p.today, p.profiles]);
  const slashList = text.startsWith('/') && !/\s/.test(text) ? COMMANDS.filter((c) => c.startsWith(text.slice(1).toLowerCase()) && (c !== 'bug' || p.canBug)) : [];
  const mention = useMemo(() => {
    const m = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, mentionAt || text.length));
    if (!m) return null;
    const q = m[2].toLowerCase();
    const list = p.profiles.filter((x) => x.id !== p.meId && (x.username.toLowerCase().startsWith(q) || x.displayName.toLowerCase().startsWith(q)));
    return list.length ? { q, list, at: (mentionAt || text.length) - m[2].length - 1 } : null;
  }, [text, mentionAt, p.profiles, p.meId]);

  const change = (v: string) => {
    setText(v);
    setMentionAt(area.current?.selectionStart ?? v.length);
    p.onTyping(!!v.trim());
  };
  const pickFile = (f: File) => {
    setSizeError(false);
    if (f.size > MAX_FILE_BYTES) { setSizeError(true); return; }
    setFile({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    area.current?.focus();
  };
  const reset = () => { setText(''); setFile(null); setEmoji(false); p.onTyping(false); try { localStorage.removeItem(DRAFT_KEY(p.channel)); } catch { /* storage blocked */ } };

  const submit = async () => {
    if (busy) return;
    const body = text.trim();
    if (p.editing) { if (body || p.editing.fileId) { p.onSaveEdit(body); reset(); } return; }
    if (command && !file) { p.onCommand(command); reset(); return; }
    if (!body && !file) return;
    const f = file?.file ?? null;
    reset();
    if (!f) { void p.onSend(body, null).then((ok) => { if (!ok) setText((cur) => cur || body); }); return; }
    setBusy(true);
    const ok = await p.onSend(body, f);
    setBusy(false);
    if (!ok) { setText((cur) => cur || body); setFile({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }); }
  };

  // Voice notes: tap the microphone, talk, then send (or throw away).
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MIME_CHOICES.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const state = { r, chunks: [] as Blob[], send: false, mime: r.mimeType || mime || 'audio/webm' };
      recorder.current = state;
      r.ondataavailable = (e) => { if (e.data.size) state.chunks.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        if (!state.send || !state.chunks.length) return;
        const type = state.mime.split(';')[0];
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const voice = new File(state.chunks, `voice-${Date.now()}.${ext}`, { type });
        setBusy(true);
        void p.onSend('', voice).finally(() => setBusy(false));
      };
      r.start(250);
      navigator.vibrate?.(15);
      setRec({ since: Date.now() });
      setNow(Date.now());
    } catch { alert(t('micBlocked')); }
  };
  const stopRec = (send: boolean) => {
    const s = recorder.current;
    if (!s) return;
    s.send = send && Date.now() - (rec?.since ?? 0) > 600;
    s.r.stop();
    recorder.current = null;
    setRec(null);
  };
  useEffect(() => () => { recorder.current?.r.stop(); }, []);

  const secs = rec ? Math.max(0, Math.floor((now - rec.since) / 1000)) : 0;
  const empty = !text.trim() && !file;

  return (
    <div className="relative border-t border-line bg-surface/95 px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-3">
      {/* Suggestions: commands, mentions, the command preview */}
      {slashList.length > 0 && (
        <div className="card absolute inset-x-2 bottom-full mb-2 overflow-hidden p-1 shadow-lg">
          {slashList.map((c) => (
            <button key={c} type="button" onClick={() => { setText(`/${c} `); area.current?.focus(); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start hover:bg-surface-2">
              <span className="text-xl" aria-hidden>{COMMAND_ICON[c]}</span>
              <span className="min-w-0 flex-1"><span className="block font-mono text-sm font-semibold" dir="ltr">/{c}</span><span className="block truncate text-xs text-muted">{t(`cmd.${c}`)}</span></span>
            </button>
          ))}
        </div>
      )}
      {mention && !slashList.length && (
        <div className="card absolute inset-x-2 bottom-full mb-2 overflow-hidden p-1 shadow-lg">
          {mention.list.map((x) => (
            <button key={x.id} type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start hover:bg-surface-2"
              onClick={() => { const v = `${text.slice(0, mention.at)}@${x.username} ${text.slice(mentionAt || text.length)}`; setText(v); setMentionAt(0); area.current?.focus(); }}>
              <Avatar profile={x} size="sm" /><span className="font-medium">{x.displayName}</span><span className="text-xs text-muted" dir="ltr">@{x.username}</span>
            </button>
          ))}
        </div>
      )}
      {command && !slashList.length && !p.editing && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-dashed border-brand/50 bg-brand-soft/60 px-3 py-2 text-xs">
          <span className="text-base" aria-hidden>{COMMAND_ICON[command.cmd]}</span>
          <span className="font-semibold text-brand">{t(`cmdWill.${command.cmd}`)}</span>
          <span className="min-w-0 truncate font-medium" dir="auto">{command.cmd === 'decision' ? command.text : command.title}</span>
          {command.cmd !== 'decision' && command.assigneeId && <Avatar profile={p.profiles.find((x) => x.id === command.assigneeId) ?? null} size="sm" />}
          {command.cmd === 'task' && command.priority > 0 && <PriorityChip priority={command.priority} />}
          {command.cmd === 'bug' && <OptionChip style={LEVEL4_STYLE[command.severity]} label={t(`sev.${command.severity}`)} />}
          {command.cmd === 'task' && command.dueDate && <span className="flex items-center gap-1 text-muted"><CalendarClock className="size-3.5" />{formatDate(locale, `${command.dueDate}T12:00:00Z`)}</span>}
          <span className="ms-auto text-muted">{t('cmdEnter')}</span>
        </div>
      )}
      {/* What this message answers or which message is being edited */}
      {(p.reply || p.editing) && (
        <div className="mb-2 flex items-center gap-2 ps-1">
          {p.editing ? <Pencil className="size-5 shrink-0 text-brand" /> : <Reply className="size-5 shrink-0 text-brand" />}
          <div className="min-w-0 flex-1 border-s-[3px] border-brand ps-2">
            <div className={clsx('truncate text-[13px] font-semibold', p.editing ? 'text-brand' : nameColor(p.reply?.authorId ?? null))}>{p.editing ? t('editing') : t('replyingTo', { name: p.replyAuthor?.displayName ?? '—' })}</div>
            <div className="truncate text-[13px] text-muted" dir="auto">{p.editing ? p.editing.body : p.replyPreview}</div>
          </div>
          <button type="button" onClick={() => { if (p.editing) setText(''); p.onCancel(); }} className="icon-btn size-9" aria-label={t('cancel')}><X className="size-5" /></button>
        </div>
      )}
      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-surface-2 p-2">
          {file.url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={file.url} alt="" className="size-14 rounded-xl object-cover" />
            : <span className="flex size-14 items-center justify-center rounded-xl bg-brand text-brand-ink"><FileText className="size-6" /></span>}
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium" dir="ltr">{file.file.name}</div><div className="text-xs text-muted">{formatBytes(locale, file.file.size)} · {t('addCaption')}</div></div>
          <button type="button" onClick={() => setFile(null)} className="icon-btn size-9" aria-label={t('cancel')}><X className="size-5" /></button>
        </div>
      )}
      {(p.error || sizeError) && <p className="mb-1 px-2 text-xs text-danger">{sizeError ? t('tooLarge') : p.error}</p>}
      {emoji && (
        <div className="card absolute start-2 bottom-full mb-2 grid max-h-64 w-[min(22rem,calc(100%-1rem))] grid-cols-8 gap-0.5 overflow-y-auto p-2 shadow-lg">
          {EMOJI.map((e) => <button key={e} type="button" className="flex size-9 items-center justify-center rounded-lg text-xl hover:bg-surface-2" onClick={() => { setText((x) => x + e); area.current?.focus(); }}>{e}</button>)}
        </div>
      )}

      {rec ? (
        <div className="flex min-h-12 items-center gap-2">
          <button type="button" onClick={() => stopRec(false)} className="icon-btn text-danger" aria-label={t('discard')}><Trash2 className="size-5" /></button>
          <span className="gc-rec size-3 rounded-full bg-danger" />
          <span className="font-mono text-sm tabular-nums" dir="ltr">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <span className="flex-1 truncate text-sm text-muted">{t('recording')}</span>
          <button type="button" onClick={() => stopRec(true)} className="flex size-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg transition active:scale-90" aria-label={t('send')}>
            <Send className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      ) : (
        <form className="flex items-end gap-1" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <button type="button" className={clsx('icon-btn shrink-0', emoji && 'text-brand')} aria-label={t('emoji')} onClick={() => setEmoji((x) => !x)}><Smile className="size-6" /></button>
          <textarea ref={area} value={text} rows={1} dir="auto" placeholder={p.editing ? t('editPlaceholder') : t('placeholder')}
            onChange={(e) => change(e.target.value)} onClick={(e) => setMentionAt(e.currentTarget.selectionStart)} onBlur={() => p.onTyping(false)}
            onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); pickFile(f); } }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && (p.reply || p.editing)) { e.preventDefault(); if (p.editing) setText(''); p.onCancel(); return; }
              if (e.key === 'ArrowUp' && !text && !p.editing) { e.preventDefault(); p.onEditLast(); return; }
              if (e.key === 'Tab' && slashList.length) { e.preventDefault(); setText(`/${slashList[0]} `); return; }
              if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
            }}
            className="max-h-42 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-surface-2 px-4 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted focus:border-brand" />
          {!p.editing && (
            <button type="button" className="icon-btn shrink-0" aria-label={t('attach')} onClick={() => fileInput.current?.click()}><Paperclip className="size-6" /></button>
          )}
          <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />
          {empty && !p.editing ? (
            <button type="button" onClick={() => void startRec()} disabled={busy} aria-label={t('voiceNote')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition active:scale-90 disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
            </button>
          ) : (
            <button disabled={busy} aria-label={p.editing ? t('saveEdit') : t('send')}
              className={clsx('flex size-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-60',
                command && !p.editing ? 'bg-accent' : 'bg-brand text-brand-ink')}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : command && !p.editing ? <span className="text-lg" aria-hidden>{COMMAND_ICON[command.cmd]}</span>
                : p.editing ? <SaveCheck /> : <Send className="size-5 rtl:-scale-x-100" />}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function SaveCheck() {
  return <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}
