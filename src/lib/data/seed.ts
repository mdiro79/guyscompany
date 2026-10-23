import type { Profile, Project, Task, Message, Poll, Office, FocusItem, Todo, CalendarEvent, Notification, ProjectRole } from './types';
import { todayIso } from '@/lib/format';
import { addDays } from '@/lib/todos';

// Demo data used when Supabase is not configured.
export const DEMO_PASSWORD = 'guys1234';

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

export function createSeed() {
  const ids = {
    mehdi: '00000000-0000-4000-8000-000000000001',
    sara: '00000000-0000-4000-8000-000000000002',
    nima: '00000000-0000-4000-8000-000000000003',
    reza: '00000000-0000-4000-8000-000000000004',
  };
  const profile = (id: string, username: string, displayName: string, jobTitle: string, characterId: string, extra: Partial<Profile> = {}): Profile => ({
    id, username, displayName, jobTitle, role: 'member', characterId, status: 'online',
    mustChangePassword: false, tutorialDone: true, createdAt: ago(60 * 24 * 30), ...extra,
  });
  const profiles: Profile[] = [
    profile(ids.mehdi, 'mehdi', 'Mehdi', 'Product', 'humans-doctor-male-old', { role: 'admin' }),
    profile(ids.sara, 'sara', 'Sara', 'Designer', 'humans-casual2-female', { status: 'busy' }),
    profile(ids.nima, 'nima', 'Nima', 'Frontend', 'kaykit-mage', { status: 'focus' }),
    profile(ids.reza, 'reza', 'Reza', 'Developer', 'monsters-b-cat'),
  ];

  const projects: Project[] = [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Guyscompany', description: 'Virtual office and dashboard', managerId: ids.mehdi, createdAt: ago(60 * 24 * 20) },
    { id: '10000000-0000-4000-8000-000000000002', name: 'Marketing', description: 'Launch campaign', managerId: ids.sara, createdAt: ago(60 * 24 * 10) },
  ];
  const [p1, p2] = projects.map((p) => p.id);

  let n = 0;
  const task = (title: string, description: string, column: Task['column'], tags: string[], assigneeId: string | null, start: number, due: number, extra: Partial<Task> = {}): Task => {
    n += 1;
    return {
      id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      projectId: p1, title, description, column, tags, assigneeId, needsVolunteer: false,
      startDate: day(start), dueDate: day(due), position: n, createdBy: ids.mehdi,
      createdAt: ago(60 * 24 * (10 - n / 2)), updatedAt: ago(60 * n), ...extra,
    };
  };
  const tasks: Task[] = [
    task('Redesign mobile app UI', 'Improve user experience and modern look for the mobile app.', 'idea', ['Design', 'Mobile'], ids.sara, 2, 9),
    task('AI assistant integration', 'Integrate local AI model for offline assistant feature.', 'idea', ['Backend', 'AI'], null, 4, 14, { needsVolunteer: true }),
    task('Brand identity update', 'New logo and visual identity for next quarter.', 'idea', ['Design', 'Branding'], ids.sara, 6, 20, { projectId: p2 }),
    task('Website performance optimization', 'Improve loading speed and SEO structure.', 'in_progress', ['Frontend', 'Performance'], ids.nima, -3, 2),
    task('Game character animation', 'Hook up character animations in the 3D office.', 'in_progress', ['Game Dev', 'Animation'], ids.mehdi, -2, 4),
    task('API integration', 'Connect payment gateway and handle webhooks.', 'in_progress', ['Backend', 'Payment'], ids.reza, -1, 5),
    task('User testing results', 'Analyze feedback from beta users and make improvements.', 'review', ['UX', 'Research'], ids.sara, -6, 1),
    task('Marketing campaign', 'Prepare social media content for product launch.', 'review', ['Marketing', 'Content'], ids.reza, -5, 3, { projectId: p2 }),
    task('Landing page design', 'Create modern landing page for new product.', 'done', ['Design', 'Web'], ids.sara, -12, -4),
    task('User authentication', 'Implement secure login and signup.', 'done', ['Backend', 'Security'], ids.nima, -14, -6),
    task('Bug fixes', 'Fix reported issues from production.', 'done', ['Bug', 'Hotfix'], ids.reza, -8, -2),
  ];

  const roles: ProjectRole[] = [
    { id: '60000000-0000-4000-8000-000000000001', projectId: p1, name: '3D artist', description: 'Tune materials and lighting of the office scene.', volunteerId: null, createdAt: ago(600) },
    { id: '60000000-0000-4000-8000-000000000002', projectId: p1, name: 'QA', description: 'Test on phones before each release.', volunteerId: ids.reza, createdAt: ago(500) },
  ];

  const msg = (id: number, authorId: string, body: string, minutes: number, reactions: Message['reactions'] = []): Message => ({
    id: `30000000-0000-4000-8000-${String(id).padStart(12, '0')}`, channel: 'team', authorId, body, fileId: null, createdAt: ago(minutes), reactions,
  });
  const messages: Message[] = [
    msg(1, ids.sara, 'سلام بچه‌ها! امروز جلسه‌ی بررسی طراحی رو داریم. لطفاً فایل‌های نهایی رو تا ساعت ۱۲ آپلود کنید.', 95, [{ userId: ids.mehdi, emoji: '👍' }, { userId: ids.nima, emoji: '👍' }]),
    msg(2, ids.nima, 'در حال حاضر روی بهینه‌سازی فونت‌ها کار می‌کنم. تا عصر آماده میشه.', 90, [{ userId: ids.sara, emoji: '🔥' }]),
    msg(3, ids.mehdi, 'عالی 👌 من هم انیمیشن کاراکتر رو آپدیت می‌کنم.', 80),
    msg(4, ids.reza, 'من هم بررسی مارکتینگ رو تکمیل کردم.', 40, [{ userId: ids.mehdi, emoji: '👍' }]),
  ];

  const polls: Poll[] = [
    { id: '40000000-0000-4000-8000-000000000001', question: 'امروز چقدر انرژی داری؟', taskId: null, createdBy: ids.mehdi, closesAt: new Date(Date.now() + 8 * 3600000).toISOString(), closed: false, decision: null, createdAt: ago(120) },
  ];

  const offices: Office[] = [
    { slot: 1, ownerId: ids.mehdi, wallColor: 'orange', glass: 'clear', locked: false, focus: false, isPublic: true },
    { slot: 2, ownerId: ids.sara, wallColor: 'teal', glass: 'clear', locked: false, focus: false, isPublic: false },
    { slot: 3, ownerId: ids.nima, wallColor: 'teal', glass: 'frosted', locked: true, focus: true, isPublic: false },
    { slot: 4, ownerId: ids.reza, wallColor: 'orange', glass: 'clear', locked: false, focus: false, isPublic: false },
  ];

  const focus: FocusItem[] = [
    { id: '50000000-0000-4000-8000-000000000001', userId: ids.mehdi, day: day(0), text: 'بررسی نتایج تست کاربر', done: true },
    { id: '50000000-0000-4000-8000-000000000002', userId: ids.mehdi, day: day(0), text: 'ادامه‌ی پیاده‌سازی انیمیشن کاراکتر', done: true },
    { id: '50000000-0000-4000-8000-000000000003', userId: ids.mehdi, day: day(0), text: 'جلسه‌ی تیم (ساعت ۱۴)', done: false },
    { id: '50000000-0000-4000-8000-000000000004', userId: ids.mehdi, day: day(0), text: 'آپلود فایل‌های طراحی UI', done: false },
  ];

  // Personal to-dos of the demo admin; two cleared ones from earlier days make a 3-day streak.
  const today = todayIso();
  const todo = (n: number, title: string, o: Partial<Todo> = {}): Todo => ({
    id: `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`, userId: ids.mehdi, title, done: false, doneAt: null, due: null,
    priority: 0, starred: false, clearedAt: null, createdAt: ago(600 + n), ...o,
  });
  const nextDay = (weekday: number) => addDays(today, (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 || 7);
  const todos: Todo[] = [
    todo(1, 'خرید هدیه برای دوستم', { done: true, doneAt: ago(50), due: today, starred: true }),
    todo(2, 'تماس با دکتر', { done: true, doneAt: ago(20) }),
    todo(3, 'مرتب کردن اتاق', { due: nextDay(4), priority: 1 }),
    todo(4, 'ورزش کردن', { due: nextDay(5) }),
    todo(5, 'مطالعه کتاب', { due: nextDay(6), starred: true }),
    todo(6, 'پیاده‌روی عصر', { done: true, doneAt: ago(60 * 24), clearedAt: ago(60 * 20) }),
    todo(7, 'نوشتن برنامه‌ی هفته', { done: true, doneAt: ago(60 * 48), clearedAt: ago(60 * 44) }),
  ];

  const at = (d: number, h: number) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const events: CalendarEvent[] = [
    { id: '70000000-0000-4000-8000-000000000001', title: 'Team meeting', startsAt: at(0, 14), endsAt: at(0, 15), createdBy: ids.mehdi },
    { id: '70000000-0000-4000-8000-000000000002', title: 'Design review', startsAt: at(2, 11), endsAt: at(2, 12), createdBy: ids.sara },
  ];

  const notifications: Notification[] = [
    { id: '80000000-0000-4000-8000-000000000001', userId: ids.mehdi, kind: 'task_assigned', payload: { title: 'Game character animation' }, readAt: null, createdAt: ago(30) },
    { id: '80000000-0000-4000-8000-000000000002', userId: ids.mehdi, kind: 'poll_created', payload: { title: 'امروز چقدر انرژی داری؟' }, readAt: null, createdAt: ago(120) },
  ];

  return { profiles, projects, tasks, roles, messages, polls, offices, focus, todos, events, notifications };
}
