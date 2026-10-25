import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { ProjectsView } from '@/components/pages/ProjectsView';

export default async function ProjectsPage() {
  await requirePageUser();
  const [projects, tasks, roles, issues, ideas, milestones] = await Promise.all([
    store().listProjects(), store().listTasks(), store().listRoles(), store().listIssues(), store().listIdeas(), store().listMilestones(),
  ]);
  return <ProjectsView projects={projects} tasks={tasks} roles={roles} issues={issues} ideas={ideas} milestones={milestones} today={todayIso()} />;
}
