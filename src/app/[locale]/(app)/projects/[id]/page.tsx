import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { projectChannel } from '@/lib/chat';
import { CommandCenter } from '@/components/command/CommandCenter';

export default async function ProjectCommandPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requirePageUser();
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const [projects, tasks, issues, ideas, milestones, sharedNotes, meetings, roles, decisions] = await Promise.all([
    store().listProjects(), store().listTasks(), store().listIssues(id), store().listIdeas(id), store().listMilestones(id),
    store().listSharedNotes({ projectId: id }), store().listMeetings(200), store().listRoles(), store().listMessagesOfKind(projectChannel(id), 'decision', 100),
  ]);
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();
  const comments = await store().listIssueComments(issues.map((i) => i.id));
  return (
    <CommandCenter project={project} projects={projects} tasks={tasks.filter((t) => t.projectId === id)} issues={issues} comments={comments}
      ideas={ideas} milestones={milestones} sharedNotes={sharedNotes} meetings={meetings} roles={roles.filter((r) => r.projectId === id)}
      decisions={decisions} today={todayIso()} tab={tab} />
  );
}
