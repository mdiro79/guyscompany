'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Clock, FolderKanban, NotebookPen, Pencil, Square, Users, Share2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { endMeetingAction, updateMeetingAction } from '@/app/actions/meetings';
import { formatDate, formatNumber, formatTime } from '@/lib/format';
import { clockText, meetingEnd, meetingSeconds } from '@/lib/meetings';
import type { Meeting, MeetingAttendance, MeetingNote, Project, SharedNote } from '@/lib/data/types';
import { AttendanceList, KindBadge, MeetingForm, NoteComposer, NoteItem } from './parts';

type Tab = 'mine' | 'all';

export interface MeetingsData { meetings: Meeting[]; attendance: MeetingAttendance[]; notes: MeetingNote[]; shared: SharedNote[]; projects: Project[]; tab?: string }

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return now;
}

// Title line of a meeting: name, running or ended, when, how long, which project, who started it.
function MeetingHead({ meeting, attendance, projects, now, onEdit }: { meeting: Meeting; attendance: MeetingAttendance[]; projects: Project[]; now: number; onEdit?: () => void }) {
  const t = useTranslations('meetings');
  const locale = useLocale();
  const { profiles } = useShell();
  const ended = meetingEnd(meeting, attendance, now) !== null;
  const project = projects.find((p) => p.id === meeting.projectId);
  const starter = profiles.find((p) => p.id === meeting.startedBy);
  return (
    <div>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold break-words" dir="auto">{meeting.title}</h3>
        <span className={clsx('chip shrink-0 gap-1', ended ? 'bg-surface-2 text-muted' : 'bg-[#ffe4e1] text-[#c2413b] dark:bg-[#3a2020] dark:text-[#ff8a80]')}>
          {!ended && <span className="size-1.5 animate-pulse rounded-full bg-current" />}{ended ? t('ended') : t('running')}
        </span>
        {onEdit && <button type="button" onClick={onEdit} className="icon-btn -my-2 size-9 text-muted" aria-label={t('edit')} title={t('edit')}><Pencil className="size-4" /></button>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{formatDate(locale, meeting.startedAt, { day: 'numeric', month: 'short', year: 'numeric' })} · {formatTime(locale, meeting.startedAt)}</span>
        <span className="inline-flex items-center gap-1" dir="ltr" suppressHydrationWarning><Clock className="size-3.5" />{clockText(meetingSeconds(meeting, attendance, now))}</span>
        {project && <Link href={`/projects/${project.id}?tab=notes`} className="inline-flex items-center gap-1 hover:text-ink"><FolderKanban className="size-3.5" />{project.name}</Link>}
        {starter && <span>{t('startedBy', { name: starter.displayName })}</span>}
      </div>
      <p className={clsx('mt-2 text-sm whitespace-pre-wrap', !meeting.purpose && 'text-muted italic')} dir="auto">{meeting.purpose || t('noPurpose')}</p>
    </div>
  );
}

export function MeetingsView({ meetings, attendance, notes, shared, projects, tab: initialTab }: MeetingsData) {
  const t = useTranslations('meetings');
  const tc = useTranslations('command.tabs');
  const locale = useLocale();
  const { user, profiles } = useShell();
  const now = useNow();
  const [tab, setTabState] = useState<Tab>(initialTab === 'all' ? 'all' : 'mine');
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const setTab = (next: Tab) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === 'mine') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };
  const live = meetings.find((m) => meetingEnd(m, attendance, now) === null) ?? null;
  const sharedOf = (noteId: string) => shared.find((s) => s.noteId === noteId && s.authorId === user.id);
  // My notes grouped by meeting, newest meeting first.
  const mine = useMemo(() => meetings.map((m) => ({ meeting: m, notes: notes.filter((n) => n.meetingId === m.id) })).filter((g) => g.notes.length), [meetings, notes]);
  const editForm = (m: Meeting) => (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <MeetingForm projects={projects} initial={{ title: m.title, purpose: m.purpose, projectId: m.projectId }} submitLabel={t('save')} onCancel={() => setEditing(null)}
        onSubmit={async (f) => { await updateMeetingAction(m.id, f); setEditing(null); }} />
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><NotebookPen className="size-5 text-brand" />{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </header>

      {live && (
        <section className="card border-[#f3b8b2] p-4 dark:border-[#5a2a2a]">
          <div className="mb-2 text-xs font-semibold text-[#c2413b] dark:text-[#ff8a80]">{t('current')}</div>
          {editing === live.id ? editForm(live) : <MeetingHead meeting={live} attendance={attendance} projects={projects} now={now} onEdit={() => setEditing(live.id)} />}
          <div className="mt-3"><AttendanceList meeting={live} attendance={attendance} profiles={profiles} now={now} /></div>
          <div className="mt-4 border-t border-line pt-3">
            <h4 className="mb-2 text-sm font-semibold">{t('myNotes')}</h4>
            <NoteComposer meetingId={live.id} />
            <ul className="mt-2 space-y-2">
              {notes.filter((n) => n.meetingId === live.id).toReversed().map((n) => <NoteItem key={n.id} note={n} shared={sharedOf(n.id)} projects={projects} meeting={live} />)}
            </ul>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-ghost min-h-10 text-danger" onClick={() => { if (confirm(t('confirmEnd'))) start(async () => { await endMeetingAction(live.id); }); }}>
              <Square className="size-4" />{t('end')}
            </button>
          </div>
        </section>
      )}

      <div className="flex gap-1">
        {(['mine', 'all'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={clsx('chip min-h-9 gap-1.5 px-3 text-sm', tab === k ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>
            {k === 'mine' ? <NotebookPen className="size-4" /> : <Users className="size-4" />}{t(`tabs.${k}`)}
            <span className="opacity-70">{formatNumber(locale, k === 'mine' ? notes.length : meetings.length)}</span>
          </button>
        ))}
      </div>

      {tab === 'mine' && (
        <>
          <p className="text-xs text-muted">{t('private')}</p>
          {mine.length === 0 && <p className="card py-10 text-center text-sm text-muted">{t('emptyNotes')}</p>}
          {mine.map(({ meeting, notes: list }) => (
            <section key={meeting.id} className="card p-4">
              <MeetingHead meeting={meeting} attendance={attendance} projects={projects} now={now} />
              <ul className="mt-3 space-y-2">
                {list.map((n) => <NoteItem key={n.id} note={n} shared={sharedOf(n.id)} projects={projects} meeting={meeting} />)}
              </ul>
            </section>
          ))}
        </>
      )}

      {tab === 'all' && (
        <>
          {meetings.length === 0 && <p className="card py-10 text-center text-sm text-muted">{t('empty')}</p>}
          {meetings.map((m) => {
            const fromIt = shared.filter((s) => s.meetingId === m.id);
            const myCount = notes.filter((n) => n.meetingId === m.id).length;
            return (
              <section key={m.id} className="card p-4">
                {editing === m.id ? editForm(m) : <MeetingHead meeting={m} attendance={attendance} projects={projects} now={now} onEdit={() => setEditing(m.id)} />}
                <h4 className="mt-3 mb-1.5 text-xs font-semibold text-muted">{t('attendance')}</h4>
                <AttendanceList meeting={m} attendance={attendance} profiles={profiles} now={now} />
                {fromIt.length > 0 && (
                  <>
                    <h4 className="mt-3 mb-1.5 text-xs font-semibold text-muted">{t('sharedFrom')}</h4>
                    <ul className="space-y-1.5">
                      {fromIt.map((s) => (
                        <li key={s.id} className="rounded-xl bg-surface-2 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <KindBadge kind={s.kind} />
                            <span className="font-medium" dir="auto">{s.title}</span>
                            <span className="ms-auto text-xs text-muted">{profiles.find((p) => p.id === s.authorId)?.displayName}</span>
                          </div>
                          {s.body && <p className="mt-1 text-sm whitespace-pre-wrap text-muted" dir="auto">{s.body}</p>}
                          <Link href={`/projects/${s.projectId}?tab=notes`} className="mt-1 inline-flex items-center gap-1 text-xs text-brand"><Share2 className="size-3.5" />{projects.find((p) => p.id === s.projectId)?.name} · {tc('notes')}</Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {myCount > 0 && (
                  <button type="button" onClick={() => setTab('mine')} className="mt-3 inline-flex items-center gap-1 text-xs text-brand">
                    <NotebookPen className="size-3.5" />{t('myNotes')}: {t('noteCount', { n: formatNumber(locale, myCount) })}
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
