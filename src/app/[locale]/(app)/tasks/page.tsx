import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { TaskViews } from '@/components/tasks/TaskViews';

export default async function TasksPage() {
  await requirePageUser();
  const [tasks, projects, milestones] = await Promise.all([store().listTasks(), store().listProjects(), store().listMilestones()]);
  return <TaskViews tasks={tasks} projects={projects} milestones={milestones} />;
}
