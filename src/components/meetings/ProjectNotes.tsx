'use client';
import { useLocale, useTranslations } from 'next-intl';
import { NotebookPen } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { formatDate } from '@/lib/format';
import type { Meeting, SharedNote } from '@/lib/data/types';
import { KindBadge } from './parts';

// A project's "From meetings" tab: notes and ideas members rewrote from meetings and shared with it.
export function ProjectNotes({ notes, meetings }: { notes: SharedNote[]; meetings: Meeting[] }) {
  const t = useTranslations('meetings');
  const locale = useLocale();
  const { profiles } = useShell();
  if (!notes.length) return <p className="card py-10 text-center text-sm text-muted">{t('projectEmpty')}</p>;
  return (
    <ul className="space-y-2">
      {notes.map((n) => {
        const author = profiles.find((p) => p.id === n.authorId) ?? null;
        const meeting = meetings.find((m) => m.id === n.meetingId);
        return (
          <li key={n.id} className="card p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={n.kind} />
              <h3 className="min-w-0 flex-1 font-semibold break-words" dir="auto">{n.title}</h3>
            </div>
            {n.body && <p className="mt-2 text-sm whitespace-pre-wrap" dir="auto">{n.body}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><Avatar profile={author} size="sm" />{author?.displayName ?? '—'}</span>
              <span>{formatDate(locale, n.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {meeting && (
                <Link href="/meetings?tab=all" className="inline-flex items-center gap-1 hover:text-ink"><NotebookPen className="size-3.5" />{t('fromMeeting', { name: meeting.title })}</Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
