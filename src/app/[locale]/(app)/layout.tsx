import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { configProblems, isDemo } from '@/lib/env';
import { CHAT_PAGE_SIZE } from '@/lib/limits';
import { AppShell } from '@/components/shell/AppShell';
import type { SearchItem } from '@/components/shell/TopBar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  // Missing Vercel settings are explained on the login page instead of failing here.
  if (configProblems().length) redirect(`/${locale}/login`);
  const user = await currentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword) redirect(`/${locale}/change-password`);
  const s = store();
  const [profiles, offices, notifications, messages, files, tasks, projects] = await Promise.all([
    s.listProfiles(), s.listOffices(), s.listNotifications(user.id), s.listMessages('team', CHAT_PAGE_SIZE), s.listFiles(), s.listTasks(), s.listProjects(),
  ]);
  const search: SearchItem[] = [
    ...tasks.map((t) => ({ kind: 'task' as const, id: t.id, label: t.title, href: `/tasks?task=${t.id}` })),
    ...projects.map((p) => ({ kind: 'project' as const, id: p.id, label: p.name, href: `/projects#${p.id}` })),
    ...profiles.map((p) => ({ kind: 'person' as const, id: p.id, label: p.displayName, href: '/team' })),
  ];
  return (
    <AppShell data={{ user, profiles, offices, demo: isDemo }} notifications={notifications} messages={messages} files={files} search={search}>
      {children}
    </AppShell>
  );
}
