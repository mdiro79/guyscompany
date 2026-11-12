'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { store, TASK_COLUMNS, type ChecklistItem, type Task, type TaskColumn } from '@/lib/data';
import { postSystem } from '@/lib/chat-server';
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
  milestoneId: optionalId,
  effort: z.coerce.number().int().min(0).max(4).catch(0),
  blockedReason: z.string().trim().max(300).default(''),
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
  milestoneId: form.get('milestoneId') || null,
  effort: form.get('effort') ?? 0,
  blockedReason: form.get('blocked') === 'on' ? (form.get('blockedReason') || '…') : '',
  checklist: form.get('checklist') ?? '',
});

// A milestone only counts when it belongs to the task's project.
async function cleanMilestone(milestoneId: string | null, projectId: string | null) {
  if (!milestoneId || !projectId) return null;
  return (await store().listMilestones(projectId)).some((m) => m.id === milestoneId) ? milestoneId : null;
}

// A project task that reaches Done is announced in the project's chat topic.
async function announceDone(before: { column: TaskColumn; title: string; projectId: string | null } | undefined, column: TaskColumn | undefined, taskId: string, actorId: string) {
  if (!before || column !== 'done' || before.column === 'done') return;
  await postSystem(before.projectId, actorId, { e: 'task_done', title: before.title, taskId });
}

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
  const milestoneId = await cleanMilestone(parsed.data.milestoneId, parsed.data.projectId);
  if (id) {
    const before = (await store().listTasks()).find((t) => t.id === id);
    await store().updateTask(id, { ...parsed.data, milestoneId, checklist: steps(before?.checklist) });
    if (before?.assigneeId !== parsed.data.assigneeId) await notifyAssignee(parsed.data.assigneeId, user.id, parsed.data.title);
    await announceDone(before && { ...before, projectId: parsed.data.projectId, title: parsed.data.title }, parsed.data.column, id, user.id);
  } else {
    await store().createTask({ ...parsed.data, milestoneId, checklist: steps(), createdBy: user.id });
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
  const user = await requireUser();
  if (!TASK_COLUMNS.includes(column)) return fail('error');
  const before = (await store().listTasks()).find((t) => t.id === id);
  if (!before) return fail('error');
  await store().updateTask(id, { column });
  await announceDone(before, column, id, user.id);
  revalidatePath('/', 'layout');
  return okResult();
});

// One quick change from an icon on a card (or a task card in the chat): priority, size, assignee, phase.
export const quickTaskAction = guard(async function quickTaskAction(id: string, patch: { priority?: number; effort?: number; assigneeId?: string | null; milestoneId?: string | null; blockedReason?: string }) {
  const user = await requireUser();
  const task = (await store().listTasks()).find((t) => t.id === id);
  if (!task) return fail('error');
  const clean: Partial<Task> = {};
  if (patch.priority !== undefined) clean.priority = Math.max(0, Math.min(2, Math.round(patch.priority) || 0));
  if (patch.effort !== undefined) clean.effort = Math.max(0, Math.min(4, Math.round(patch.effort) || 0));
  if (patch.blockedReason !== undefined) clean.blockedReason = patch.blockedReason.trim().slice(0, 300);
  if (patch.milestoneId !== undefined) clean.milestoneId = await cleanMilestone(patch.milestoneId, task.projectId);
  if (patch.assigneeId !== undefined) {
    clean.assigneeId = patch.assigneeId && (await store().getProfile(patch.assigneeId)) ? patch.assigneeId : null;
    if (clean.assigneeId) clean.needsVolunteer = false;
    if (clean.assigneeId !== task.assigneeId) await notifyAssignee(clean.assigneeId, user.id, task.title);
  }
  await store().updateTask(id, clean);
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
