'use client';
import { useTranslations } from 'next-intl';
import type { FileMeta, Message } from '@/lib/data/types';
import { isAudio, isImage, snippet } from '@/lib/chat';
import { useShell } from '@/components/shell/ShellContext';

export interface SystemData { e: 'task_done' | 'milestone_done' | 'issue_fixed'; title: string; taskId?: string }
export function systemData(m: Pick<Message, 'body'>): SystemData | null {
  try { const d = JSON.parse(m.body) as SystemData; return d && typeof d.e === 'string' ? d : null; } catch { return null; }
}

// One line describing a message (chat list, reply quotes, the pinned bar, notifications).
export function useMessagePreview(files: FileMeta[] = []) {
  const t = useTranslations('chatPage');
  const { profiles } = useShell();
  return (m: Message, max = 80): string => {
    if (m.kind === 'system') {
      const d = systemData(m);
      const name = profiles.find((p) => p.id === m.authorId)?.displayName ?? '—';
      return d ? t(`sys.${d.e}`, { name, title: d.title }) : '';
    }
    if (m.kind === 'task') return `${t('card.task')}: ${snippet(m, max)}`;
    if (m.kind === 'issue') return `${t('card.issue')}: ${snippet(m, max)}`;
    const text = snippet(m, max);
    if (m.fileId) {
      const f = files.find((x) => x.id === m.fileId);
      const kind = f && isImage(f.mime) ? `📷 ${t('photo')}` : f && isAudio(f.mime) ? `🎤 ${t('voice')}` : `📎 ${f?.name ?? t('file')}`;
      return text ? `${kind} · ${text}` : kind;
    }
    return m.kind === 'decision' ? `⚖️ ${text}` : text;
  };
}
