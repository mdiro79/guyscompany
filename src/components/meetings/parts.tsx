'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Lightbulb, StickyNote, Pencil, Trash2, Share2, Check, X, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Dialog } from '@/components/ui/Dialog';
import { addNoteAction, deleteNoteAction, shareNoteAction, unshareNoteAction, updateNoteAction } from '@/app/actions/meetings';
import { formatNumber, formatTime } from '@/lib/format';
import { attendedSeconds, inRoom, MEETING_PURPOSE_MAX, MEETING_TITLE_MAX, NOTE_MAX, SHARED_BODY_MAX, SHARED_TITLE_MAX } from '@/lib/meetings';
import type { Meeting, MeetingAttendance, MeetingNote, NoteKind, Profile, Project, SharedNote } from '@/lib/data/types';

// Building blocks of meetings and notes, used on the meetings page (light) and in the office (dark).

export type Tone = 'light' | 'dark';
const field = (tone: Tone) => (tone === 'dark'
  ? 'w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[#7fd0c2]'
  : 'input');
const primary = (tone: Tone) => (tone === 'dark' ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#2f5d45] px-4 text-sm font-semibold text-white disabled:opacity-40' : 'btn-primary min-h-10');
const quiet = (tone: Tone) => (tone === 'dark' ? 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-sm hover:bg-white/20' : 'btn-ghost min-h-10');
const KIND_ICON = { note: StickyNote, idea: Lightbulb };
const KIND_CLS = { note: 'bg-[#e6eefb] text-[#3567c4] dark:bg-[#1c2636] dark:text-[#8fb3f2]', idea: 'bg-accent-soft text-[#b9531a] dark:text-accent' };
const KIND_DARK = { note: 'bg-[#5b8def]/25 text-[#b9d0ff]', idea: 'bg-[#f08a3c]/25 text-[#ffc89c]' };

export function KindBadge({ kind, tone = 'light' }: { kind: NoteKind; tone?: Tone }) {
  const t = useTranslations('meetings');
  const Icon = KIND_ICON[kind];
  return <span className={clsx('chip shrink-0 gap-1', tone === 'dark' ? KIND_DARK[kind] : KIND_CLS[kind])}><Icon className="size-3.5" />{t(`kind.${kind}`)}</span>;
}

function KindToggle({ kind, onChange, tone }: { kind: NoteKind; onChange: (k: NoteKind) => void; tone: Tone }) {
  const t = useTranslations('meetings');
  return (
    <div className="flex gap-1.5">
      {(['note', 'idea'] as const).map((k) => {
        const Icon = KIND_ICON[k];
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={kind === k}
            className={clsx('chip min-h-8 gap-1', kind === k ? (tone === 'dark' ? 'bg-white text-[#1d2740]' : 'bg-brand text-brand-ink') : tone === 'dark' ? 'bg-white/10 text-white/75' : 'bg-surface-2 text-muted')}>
            <Icon className="size-3.5" />{t(`kind.${k}`)}
          </button>
        );
      })}
    </div>
  );
}

export interface MeetingFields { title: string; purpose: string; projectId: string | null }

/** Name, purpose and project of a meeting: when starting one, or editing it. */
export function MeetingForm({ initial, projects, submitLabel, onSubmit, onCancel, tone = 'light', error }: {
  initial?: MeetingFields; projects: Project[]; submitLabel: string; onSubmit: (f: MeetingFields) => Promise<void> | void; onCancel?: () => void; tone?: Tone; error?: string | null;
}) {
  const t = useTranslations('meetings');
  const [f, setF] = useState<MeetingFields>(initial ?? { title: '', purpose: '', projectId: null });
  const [pending, start] = useTransition();
  return (
    <form className="space-y-2.5" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) start(async () => { await onSubmit(f); }); }}>
      <label className="block">
        <span className={clsx('mb-1 block text-xs font-semibold', tone === 'dark' ? 'text-white/75' : 'text-muted')}>{t('name')}</span>
        <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={MEETING_TITLE_MAX} placeholder={t('namePh')} dir="auto"
          className={clsx(field(tone), 'min-h-11')} required />
      </label>
      <label className="block">
        <span className={clsx('mb-1 block text-xs font-semibold', tone === 'dark' ? 'text-white/75' : 'text-muted')}>{t('purpose')}</span>
        <textarea value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} maxLength={MEETING_PURPOSE_MAX} rows={2} placeholder={t('purposePh')} dir="auto"
          className={clsx(field(tone), 'py-2')} />
      </label>
      <label className="block">
        <span className={clsx('mb-1 block text-xs font-semibold', tone === 'dark' ? 'text-white/75' : 'text-muted')}>{t('project')}</span>
        <select value={f.projectId ?? ''} onChange={(e) => setF({ ...f, projectId: e.target.value || null })} className={clsx(field(tone), 'min-h-11', tone === 'dark' && '[&>option]:text-black')}>
          <option value="">{t('noProject')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="text-sm text-[#ff8a80]">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className={quiet(tone)}>{t('cancel')}</button>}
        <button className={primary(tone)} disabled={!f.title.trim() || pending}>{pending && <Loader2 className="size-4 animate-spin" />}{submitLabel}</button>
      </div>
    </form>
  );
}

/** Quick capture of a note or an idea during a meeting (Enter adds, Shift+Enter for a new line). */
export function NoteComposer({ meetingId, tone = 'light', autoFocus }: { meetingId: string; tone?: Tone; autoFocus?: boolean }) {
  const t = useTranslations('meetings');
  const [kind, setKind] = useState<NoteKind>('note');
  const [body, setBody] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const add = () => {
    const v = body.trim();
    if (!v) return;
    setBody(''); setFailed(false);
    start(async () => { const r = await addNoteAction(meetingId, { kind, body: v }).catch(() => null); if (!r?.ok) { setBody(v); setFailed(true); } });
  };
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <KindToggle kind={kind} onChange={setKind} tone={tone} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={NOTE_MAX} rows={2} placeholder={t('notePh')} dir="auto" autoFocus={autoFocus}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } }}
        className={clsx(field(tone), 'py-2')} />
      <div className="flex items-center justify-end gap-2">
        {failed && <span role="alert" className="me-auto text-xs text-[#ff8a80]">{t('failed')}</span>}
        <button className={primary(tone)} disabled={!body.trim() || pending}>{pending && <Loader2 className="size-4 animate-spin" />}{t('add')}</button>
      </div>
    </form>
  );
}

/** One of my notes: edit, delete, and (on the meetings page) rewrite it for a project. */
export function NoteItem({ note, shared, projects, meeting, tone = 'light', canShare = true }: {
  note: MeetingNote; shared?: SharedNote; projects: Project[]; meeting?: Meeting; tone?: Tone; canShare?: boolean;
}) {
  const t = useTranslations('meetings');
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [kind, setKind] = useState(note.kind);
  const [sharing, setSharing] = useState(false);
  const [, start] = useTransition();
  useEffect(() => { if (!editing) { setDraft(note.body); setKind(note.kind); } }, [note.body, note.kind, editing]);
  const save = () => {
    const v = draft.trim();
    if (!v) return;
    setEditing(false);
    start(async () => { await updateNoteAction(note.id, { body: v, kind }); });
  };
  const projectName = shared ? projects.find((p) => p.id === shared.projectId)?.name ?? '' : '';
  const btn = tone === 'dark' ? 'flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10' : 'icon-btn size-9 text-muted';
  return (
    <li className={clsx('rounded-xl p-2.5', tone === 'dark' ? 'bg-white/[0.07]' : 'border border-line bg-surface')}>
      <div className="flex items-start gap-2">
        <KindBadge kind={editing ? kind : note.kind} tone={tone} />
        <span className={clsx('mt-0.5 text-[11px]', tone === 'dark' ? 'text-white/50' : 'text-muted')}>{formatTime(locale, note.createdAt)}</span>
        <div className="ms-auto flex shrink-0">
          {!editing && <button type="button" onClick={() => setEditing(true)} className={btn} aria-label={t('edit')} title={t('edit')}><Pencil className="size-4" /></button>}
          {!editing && canShare && (
            <button type="button" onClick={() => setSharing(true)} className={btn} aria-label={t('rewrite')} title={t('rewrite')}><Share2 className="size-4" /></button>
          )}
          {!editing && (
            <button type="button" onClick={() => { if (confirm(t('confirmDelete'))) start(async () => { await deleteNoteAction(note.id); }); }} className={btn} aria-label={t('delete')} title={t('delete')}><Trash2 className="size-4" /></button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <KindToggle kind={kind} onChange={setKind} tone={tone} />
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={NOTE_MAX} rows={3} dir="auto" autoFocus className={clsx(field(tone), 'py-2')} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={quiet(tone)}><X className="size-4" />{t('cancel')}</button>
            <button type="button" onClick={save} disabled={!draft.trim()} className={primary(tone)}><Check className="size-4" />{t('save')}</button>
          </div>
        </div>
      ) : <p className="mt-1.5 text-sm break-words whitespace-pre-wrap" dir="auto">{note.body}</p>}
      {shared && !editing && (
        <button type="button" onClick={() => setSharing(true)} className={clsx('mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-xs',
          tone === 'dark' ? 'bg-[#2f5d45]/40 text-[#b8ead4]' : 'bg-brand-soft text-brand')}>
          <Share2 className="size-3.5 shrink-0" /><span className="truncate">{t('sharedIn', { project: projectName })}: {shared.title}</span>
        </button>
      )}
      {sharing && <ShareDialog note={note} shared={shared} projects={projects} meeting={meeting} onClose={() => setSharing(false)} />}
    </li>
  );
}

/** Rewrites a note for a project and shares it with the team (or updates / stops sharing it). */
export function ShareDialog({ note, shared, projects, meeting, onClose }: { note: MeetingNote; shared?: SharedNote; projects: Project[]; meeting?: Meeting; onClose: () => void }) {
  const t = useTranslations('meetings');
  const [projectId, setProjectId] = useState(shared?.projectId ?? meeting?.projectId ?? projects[0]?.id ?? '');
  const [kind, setKind] = useState<NoteKind>(shared?.kind ?? note.kind);
  const firstLine = note.body.split('\n')[0].slice(0, SHARED_TITLE_MAX);
  const [title, setTitle] = useState(shared?.title ?? firstLine);
  const [body, setBody] = useState(shared?.body ?? note.body);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const publish = () => start(async () => {
    const r = await shareNoteAction(note.id, { projectId, kind, title, body }).catch(() => null);
    if (r?.ok) onClose(); else setError(true);
  });
  return (
    <Dialog open onClose={onClose} title={shared ? t('editShared') : t('shareTitle')} wide>
      <div className="space-y-3 text-ink">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-1 text-xs font-semibold text-muted">{t('original')}{meeting ? ` · ${t('fromMeeting', { name: meeting.title })}` : ''}</div>
          <p className="text-sm whitespace-pre-wrap" dir="auto">{note.body}</p>
        </div>
        <KindToggle kind={kind} onChange={setKind} tone="light" />
        <label className="block"><span className="label">{t('project')}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">{t('titleField')}</span>
          <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={SHARED_TITLE_MAX} dir="auto" className="input" />
        </label>
        <label className="block"><span className="label">{t('bodyField')}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={SHARED_BODY_MAX} rows={6} dir="auto" className="input py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-danger">{t('failed')}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {shared && (
            <button type="button" className="btn-ghost me-auto text-danger" disabled={pending}
              onClick={() => start(async () => { const r = await unshareNoteAction(shared.id).catch(() => null); if (r?.ok) onClose(); else setError(true); })}>{t('unshare')}</button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary" disabled={pending || !title.trim() || !projectId} onClick={publish}>
            {pending && <Loader2 className="size-4 animate-spin" />}{shared ? t('update') : t('publish')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Who attended and for how long (`present`: members in the room right now, from the office). */
export function AttendanceList({ meeting, attendance, profiles, now, present = [], tone = 'light' }: {
  meeting: Meeting; attendance: MeetingAttendance[]; profiles: Profile[]; now: number; present?: string[]; tone?: Tone;
}) {
  const t = useTranslations('meetings');
  const locale = useLocale();
  const end = meeting.endedAt ? Date.parse(meeting.endedAt) : now;
  const rows = attendance.filter((a) => a.meetingId === meeting.id);
  const ids = [...new Set([...rows.map((a) => a.userId), ...(meeting.endedAt ? [] : present)])];
  const minutes = (s: number) => (s < 60 ? t('underMinute') : t('minutes', { n: formatNumber(locale, Math.round(s / 60)) }));
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const p = profiles.find((x) => x.id === id);
        if (!p) return null;
        const a = rows.find((x) => x.userId === id);
        const here = !meeting.endedAt && (present.includes(id) || (!!a && inRoom(a, now)));
        return (
          <li key={id} className={clsx('flex items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-2.5 text-xs', tone === 'dark' ? 'bg-white/10' : 'bg-surface-2')}
            title={a ? t('joinedAt', { time: formatTime(locale, a.firstJoinedAt) }) : undefined}>
            <span className="relative"><Avatar profile={p} size="sm" />
              {here && <span className="absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full bg-[#3ee07a] ring-2 ring-surface" title={t('inRoom')} />}
            </span>
            <span className="font-medium">{p.displayName}</span>
            <span className={tone === 'dark' ? 'text-white/55' : 'text-muted'} suppressHydrationWarning>{a ? minutes(attendedSeconds(a, end)) : t('inRoom')}</span>
          </li>
        );
      })}
    </ul>
  );
}
