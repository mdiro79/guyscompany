'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { store, TASK_COLUMNS, type ChecklistItem, type TaskColumn } from '@/lib/data';
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
  priority: z.coerce.number().int().min(0).max(2).catch(0),
  // One step per line; at most 20.
  checklist: z.string().default('').transform((s) => s.split('\n').map((x) => x.trim().slice(0, 160)).filter(Boolean).slice(0, 20)),
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
  priority: form.get('priority') ?? 0,
  checklist: form.get('checklist') ?? '',
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
  // Steps keep their tick when the list is edited (matched by their text).
  const steps = (old: ChecklistItem[] = []) => parsed.data.checklist.map((text) => ({ text, done: old.find((o) => o.text === text)?.done ?? false }));
  if (id) {
    const before = (await store().listTasks()).find((t) => t.id === id);
    await store().updateTask(id, { ...parsed.data, checklist: steps(before?.checklist) });
    if (before?.assigneeId !== parsed.data.assigneeId) await notifyAssignee(parsed.data.assigneeId, user.id, parsed.data.title);
  } else {
    await store().createTask({ ...parsed.data, checklist: steps(), createdBy: user.id });
    await notifyAssignee(parsed.data.assigneeId, user.id, parsed.data.title);
  }
  revalidatePath('/', 'layout');
  return okResult('saved');
});

// Ticks or unticks one step of a task's checklist.
export const toggleStepAction = guard(async function toggleStepAction(id: string, index: number, done: boolean) {
  await requireUser();
  const task = (await store().listTasks()).find((t) => t.id === id);
  if (!task || !task.checklist[index]) return fail('error');
  await store().updateTask(id, { checklist: task.checklist.map((s, i) => (i === index ? { ...s, done } : s)) });
  revalidatePath('/', 'layout');
  return okResult();
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
