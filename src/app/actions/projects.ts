'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { fail, okResult, type ActionResult } from './result';

export async function saveProjectAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const description = String(form.get('description') ?? '').trim().slice(0, 2000);
  const managerId = String(form.get('managerId') ?? '') || null;
  if (!name) return fail('error');
  const id = String(form.get('id') ?? '');
  if (id) {
    const p = (await store().listProjects()).find((x) => x.id === id);
    if (!p || (user.role !== 'admin' && p.managerId !== user.id)) return fail('forbidden');
    await store().updateProject(id, { name, description, managerId });
  } else {
    await store().createProject({ name, description, managerId: managerId ?? user.id });
  }
  revalidatePath('/', 'layout');
  return okResult('saved');
}

export async function deleteProjectAction(id: string) {
  const user = await requireUser();
  const p = (await store().listProjects()).find((x) => x.id === id);
  if (!p || (user.role !== 'admin' && p.managerId !== user.id)) return fail('forbidden');
  await store().deleteProject(id);
  revalidatePath('/', 'layout');
  return okResult();
}

export async function createRoleAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const projectId = String(form.get('projectId') ?? '');
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  if (!projectId || !name) return fail('error');
  await store().createRole({ projectId, name, description: String(form.get('description') ?? '').trim().slice(0, 500) });
  revalidatePath('/', 'layout');
  return okResult('saved');
}

export async function volunteerRoleAction(id: string, join: boolean) {
  const user = await requireUser();
  const role = (await store().listRoles()).find((r) => r.id === id);
  if (!role) return fail('error');
  if (join && role.volunteerId && role.volunteerId !== user.id) return fail('taken');
  if (!join && role.volunteerId !== user.id) return fail('error');
  await store().updateRole(id, { volunteerId: join ? user.id : null });
  if (join) {
    const project = (await store().listProjects()).find((p) => p.id === role.projectId);
    if (project?.managerId && project.managerId !== user.id) {
      await store().createNotification({ userId: project.managerId, kind: 'role_volunteer', payload: { name: user.displayName, title: role.name } });
    }
  }
  revalidatePath('/', 'layout');
  return okResult();
}

export async function deleteRoleAction(id: string) {
  await requireUser();
  await store().deleteRole(id);
  revalidatePath('/', 'layout');
  return okResult();
}
