import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { ProjectsView } from '@/components/pages/ProjectsView';

export default async function ProjectsPage() {
  await requirePageUser();
  const [projects, tasks, roles] = await Promise.all([store().listProjects(), store().listTasks(), store().listRoles()]);
  return <ProjectsView projects={projects} tasks={tasks} roles={roles} />;
}
