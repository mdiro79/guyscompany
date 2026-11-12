'use client';
import { useLocale, useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { DecisionGlyph } from '@/components/icons/glyphs';
import { formatDate } from '@/lib/format';
import { projectChannel } from '@/lib/chat';
import type { Message, Project } from '@/lib/data/types';

// The project's decision log: messages of its chat topic the team marked as decided, newest first,
// each one a tap away from its conversation.
export function DecisionsPanel({ project, decisions }: { project: Project; decisions: Message[] }) {
  const t = useTranslations('projects');
  const locale = useLocale();
  const { profiles } = useShell();
  const chat = `/chat?c=${encodeURIComponent(projectChannel(project.id))}`;
  return (
    <section className="card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <DecisionGlyph className="size-6 text-[#a26a00] dark:text-[#f0c766]" />
        <h2 className="flex-1 font-semibold">{t('decisions')}</h2>
        <Link href={chat} className="btn-ghost min-h-9 px-3 text-sm"><MessageCircle className="size-4" />{t('discuss')}</Link>
      </div>
      {decisions.length === 0 ? (
        <div className="rounded-2xl bg-surface-2 p-6 text-center text-sm text-muted">{t('noDecisions')}</div>
      ) : (
        <ol className="relative space-y-3 border-s-2 border-[#d9a520]/40 ps-5">
          {decisions.map((d) => {
            const a = profiles.find((p) => p.id === d.authorId) ?? null;
            return (
              <li key={d.id} className="relative">
                <span className="absolute top-3 -start-[1.95rem] flex size-5 items-center justify-center rounded-full bg-[#d9a520] text-white ring-4 ring-surface"><DecisionGlyph className="size-3" /></span>
                <Link href={`${chat}&m=${d.id}`} className="block rounded-2xl bg-[#fbf1d3]/70 p-3 transition hover:bg-[#fbf1d3] dark:bg-[#3a3016]/70 dark:hover:bg-[#3a3016]">
                  <p className="whitespace-pre-wrap text-sm leading-6" dir="auto">{d.body}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted"><Avatar profile={a} size="sm" />{a?.displayName}<span>·</span>{formatDate(locale, d.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
