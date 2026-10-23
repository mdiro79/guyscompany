import { store } from '@/lib/data';
import { IdeasView } from '@/components/pages/IdeasView';
import { currentUser } from '@/lib/auth';
import { redactVotes } from '@/lib/polls';

export default async function IdeasPage() {
  const [polls, votes, tasks, projects] = await Promise.all([store().listPolls(), store().listVotes(), store().listTasks(), store().listProjects()]);
  const user = (await currentUser())!;
  return <IdeasView polls={polls} votes={redactVotes(polls, votes, user.id)} ideas={tasks.filter((t) => t.column === 'idea' || polls.some((p) => p.taskId === t.id))} projects={projects} />;
}
