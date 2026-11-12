'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { NotebookPen, Pencil, Square, Users, X, FolderKanban, ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { endMeetingAction, startMeetingAction, updateMeetingAction } from '@/app/actions/meetings';
import { clockText, meetingSeconds } from '@/lib/meetings';
import type { Meeting, MeetingAttendance, MeetingNote, Project } from '@/lib/data/types';
import { AttendanceList, MeetingForm, NoteComposer, NoteItem } from '@/components/meetings/parts';
import { useKeyboardOpen } from '@/lib/viewport';

/**
 * Where a panel of the conference room goes while a phone's keyboard is open: small, in the top corner
 * of what is still visible above the keyboard (not under it, and not in the middle of the view).
 */
export const KEYBOARD_DOCK = 'fixed z-50 top-[calc(var(--vv-top,0px)+0.375rem)] ltr:left-[max(0.375rem,env(safe-area-inset-left))] rtl:right-[max(0.375rem,env(safe-area-inset-right))]';
export const KEYBOARD_PANEL = 'max-h-[calc(var(--vvh,100dvh)-0.75rem)] w-[min(24rem,calc(100vw-0.75rem))] landscape:w-[min(24rem,58vw)]';

/** Keeps the field being typed in visible inside a scrolling panel once the keyboard has opened. */
export function useFocusInView(panel: React.RefObject<HTMLElement | null>, kb: boolean) {
  useEffect(() => {
    if (!kb) return;
    const id = setTimeout(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && panel.current?.contains(el)) el.scrollIntoView({ block: 'nearest' });
    }, 120);
    return () => clearTimeout(id);
  }, [kb, panel]);
}

export interface OfficeMeeting { meeting: Meeting | null; attendance: MeetingAttendance[]; notes: MeetingNote[]; projects: Project[] }
export type MeetingPanelMode = 'none' | 'start' | 'info' | 'notes';

/**
 * The meeting in the conference room: "Start meeting" (name, purpose, project) when none runs; otherwise a
 * pill with its name, running time and head count that opens its details: purpose, who attends and for
 * how long, my notes from it (kept in my profile), rename and end. `present`: members in the room now.
 */
export function MeetingPanel({ data, running, mode, onMode, presentNow }: {
  data: OfficeMeeting; running: Meeting | null; mode: MeetingPanelMode; onMode: (m: MeetingPanelMode) => void; presentNow: () => string[];
}) {
  const t = useTranslations('meetings');
  // Ticks every second for the running time; who is in the room is read from the live connections each time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!running) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [running]);
  const present = running ? presentNow() : [];
  const { profiles } = useShell();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const notesRef = useRef<HTMLDivElement>(null);
  const kb = useKeyboardOpen();
  const dialog = useRef<HTMLDivElement>(null);
  useFocusInView(dialog, kb);
  useEffect(() => { if (mode === 'none') { setEditing(false); setError(null); } }, [mode]);
  useEffect(() => { if (mode === 'notes') notesRef.current?.scrollIntoView({ block: 'nearest' }); }, [mode]);
  const project = running && data.projects.find((p) => p.id === running.projectId);
  const count = running ? new Set([...data.attendance.filter((a) => a.meetingId === running.id && a.joinedAt).map((a) => a.userId), ...present]).size : 0;
  const panel = clsx('pointer-events-auto overflow-y-auto overscroll-contain rounded-2xl bg-black/80 text-sm text-white shadow-xl backdrop-blur',
    kb ? `${KEYBOARD_PANEL} p-2` : 'max-h-[calc(100dvh-8.5rem)] w-[min(26rem,calc(100vw-1.5rem))] p-3 short:max-h-[calc(100dvh-7.25rem)]');
  // While typing on a phone the title row and hints step aside: the visible part is small.
  const head = (title: string, icon: React.ReactNode) => (
    <div className={clsx('mb-2 flex items-center gap-2', kb && 'hidden')}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#c2417c]/30 text-[#ffb3d1]">{icon}</span>
      <span className="me-auto min-w-0 truncate font-semibold" dir="auto">{title}</span>
      <button type="button" onClick={() => onMode('none')} aria-label={t('cancel')} className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-4" /></button>
    </div>
  );

  return (
    <>
      {running ? (
        <button type="button" onClick={() => onMode(mode === 'none' ? 'info' : 'none')} aria-expanded={mode !== 'none'}
          className="gc-kb-hide flex min-h-11 max-w-[min(20rem,60vw)] items-center gap-2 rounded-xl bg-[#c2417c] px-3 text-sm font-semibold shadow-lg transition-transform active:scale-95">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-white" />
          <span className="truncate" dir="auto">{running.title}</span>
          <span className="shrink-0 font-normal tabular-nums opacity-85" dir="ltr">{clockText(meetingSeconds(running, data.attendance, now))}</span>
          <span className="flex shrink-0 items-center gap-0.5 font-normal opacity-85"><Users className="size-3.5" />{count}</span>
        </button>
      ) : (
        <button type="button" onClick={() => onMode(mode === 'start' ? 'none' : 'start')}
          className="gc-kb-hide flex min-h-11 items-center gap-2 rounded-xl bg-[#c2417c] px-4 text-sm font-semibold shadow-lg transition-transform active:scale-95">
          <Users className="size-4" />{t('start')}
        </button>
      )}

      {mode !== 'none' && (
        <div ref={dialog} className={kb ? KEYBOARD_DOCK : 'absolute top-full left-1/2 mt-2 -translate-x-1/2'} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onMode('none'); } }}>
          {!running ? (
            <div className={panel} role="dialog" aria-label={t('newMeeting')}>
              {head(t('newMeeting'), <Users className="size-4" />)}
              <p className={clsx('mb-2 text-xs text-white/65', kb && 'hidden')}>{t('startHint')}</p>
              <MeetingForm tone="dark" projects={data.projects} submitLabel={t('begin')} error={error} onCancel={() => onMode('none')}
                onSubmit={async (f) => {
                  setError(null);
                  const r = await startMeetingAction(f).catch(() => null);
                  if (r?.ok) onMode('notes');
                  else setError(r?.error === 'running' ? t('alreadyRunning') : r?.error === 'title' ? t('nameRequired') : t('failed'));
                }} />
            </div>
          ) : (
            <div className={panel} role="dialog" aria-label={running.title}>
              {head(running.title, <Users className="size-4" />)}
              {editing ? (
                <div className="mb-3 rounded-xl bg-white/[0.06] p-2.5">
                  <MeetingForm tone="dark" projects={data.projects} submitLabel={t('save')} onCancel={() => setEditing(false)}
                    initial={{ title: running.title, purpose: running.purpose, projectId: running.projectId }}
                    onSubmit={async (f) => { await updateMeetingAction(running.id, f); setEditing(false); }} />
                </div>
              ) : (
                <div className="mb-3">
                  <div className="flex items-start gap-2">
                    <p className={clsx('min-w-0 flex-1 whitespace-pre-wrap', !running.purpose && 'text-white/50 italic')} dir="auto">{running.purpose || t('noPurpose')}</p>
                    <button type="button" onClick={() => setEditing(true)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10" aria-label={t('edit')} title={t('edit')}><Pencil className="size-4" /></button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/60">
                    <span dir="ltr" className="tabular-nums">⏱ {clockText(meetingSeconds(running, data.attendance, now))}</span>
                    {project && <span className="inline-flex items-center gap-1"><FolderKanban className="size-3.5" />{project.name}</span>}
                    {running.startedBy && <span>{t('startedBy', { name: profiles.find((p) => p.id === running.startedBy)?.displayName ?? '' })}</span>}
                  </div>
                </div>
              )}
              <h4 className="mb-1.5 text-xs font-semibold text-white/70">{t('attendance')}</h4>
              <AttendanceList meeting={running} attendance={data.attendance} profiles={profiles} now={now} present={present} tone="dark" />

              <div ref={notesRef} className="mt-3 border-t border-white/10 pt-3">
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-white/70"><NotebookPen className="size-3.5" />{t('myNotes')}</h4>
                <p className="mb-2 text-[11px] text-white/50">{t('private')}</p>
                <NoteComposer meetingId={running.id} tone="dark" autoFocus={mode === 'notes'} />
                <ul className="mt-2 space-y-1.5">
                  {data.notes.filter((n) => n.meetingId === running.id).toReversed().map((n) => (
                    <NoteItem key={n.id} note={n} projects={data.projects} meeting={running} tone="dark" canShare={false} />
                  ))}
                </ul>
                <Link href="/meetings" className="mt-2 inline-flex items-center gap-1 text-xs text-[#7fd0c2] hover:underline">{t('openAll')}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" /></Link>
              </div>

              <div className="mt-3 flex justify-end">
                <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#d9443c]/90 px-3 text-sm font-semibold"
                  onClick={() => { if (confirm(t('confirmEnd'))) start(async () => { await endMeetingAction(running.id); onMode('none'); }); }}>
                  <Square className="size-4" />{t('end')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
