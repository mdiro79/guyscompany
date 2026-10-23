'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { store, TASK_COLUMNS, type TaskColumn } from '@/lib/data';
import { fail, okResult, guard, type ActionResult } from './result';

const optionalId = z.string().uuid().nullable().catch(null);
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null);

const TaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(''),
  column: z.enum(TASK_COLUMNS as [TaskColumn, ...TaskColumn[]]).default('idea'),
  tags: z.string().default('').transform((s) => s.split(/[,،]/).map((x) => x.trim()).filter(Boolean).slice(0, 6)),
  assigneeId: optionalId,
  projectId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  needsVolunteer: z.boolean().default(false),
});

const fromForm = (form: FormData) => TaskInput.safeParse({
  title: form.get('title'),
  description: form.get('description') ?? '',
  column: form.get('column') || 'idea',
  tags: form.get('tags') ?? '',
  assigneeId: form.get('assigneeId') || null,
  projectId: form.get('projectId') || null,
  startDate: form.get('startDate') || null,
  dueDate: form.get('dueDate') || null,
  needsVolunteer: form.get('needsVolunteer') === 'on',
});

async function notifyAssignee(assigneeId: string | null, actorId: string, title: string) {
  if (assigneeId && assigneeId !== actorId) {
    await store().createNotification({ userId: assigneeId, kind: 'task_assigned', payload: { title } });
  }
}

export const saveTaskAction = guard(async function saveTaskAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = fromForm(form);
  if (!parsed.success) return fail('error');
  const id = String(form.get('id') ?? '');
  if (id) {
    const before = (await store().listTasks()).find((t) => t.id === id);
    await store().updateTask(id, parsed.data);
    if (before?.assigneeId !== parsed.data.assigneeId) await notifyAssignee(parsed.data.assigneeId, user.id, parsed.data.title);
  } else {
    await store().createTask({ ...parsed.data, createdBy: user.id });
    await notifyAssignee(parsed.data.assigneeId, user.id, parsed.data.title);
  }
  revalidatePath('/', 'layout');
  return okResult('saved');
});

export const moveTaskAction = guard(async function moveTaskAction(id: string, column: TaskColumn) {
  await requireUser();
  if (!TASK_COLUMNS.includes(column)) return fail('error');
  await store().updateTask(id, { column });
  revalidatePath('/', 'layout');
  return okResult();
});

export const deleteTaskAction = guard(async function deleteTaskAction(id: string) {
  const user = await requireUser();
  // Same rule as the card menu: the creator or an admin.
  const task = (await store().listTasks()).find((t) => t.id === id);
  if (!task || (user.role !== 'admin' && task.createdBy !== user.id)) return fail('forbidden');
  await store().deleteTask(id);
  revalidatePath('/', 'layout');
  return okResult();
});

// Volunteering only takes a task that asks for a volunteer or has nobody on it (never someone else's).
export const volunteerTaskAction = guard(async function volunteerTaskAction(id: string) {
  const user = await requireUser();
  const task = (await store().listTasks()).find((t) => t.id === id);
  if (!task) return fail('error');
  if (!task.needsVolunteer && task.assigneeId && task.assigneeId !== user.id) return fail('taken');
  await store().updateTask(id, { assigneeId: user.id, needsVolunteer: false });
  revalidatePath('/', 'layout');
  return okResult();
});
