import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { CalendarView } from '@/components/pages/CalendarView';

export default async function CalendarPage() {
  await requirePageUser();
  const from = new Date(Date.now() - 120 * 86400000).toISOString();
  const to = new Date(Date.now() + 365 * 86400000).toISOString();
  const [events, tasks] = await Promise.all([store().listEvents(from, to), store().listTasks()]);
  return <CalendarView events={events} tasks={tasks} />;
}
