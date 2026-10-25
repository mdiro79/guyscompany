'use server';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createAccount, signIn } from '@/lib/auth';
import { store } from '@/lib/data';
import { isDemo, USERNAME_PATTERN } from '@/lib/env';
import { fail, guard, type ActionResult } from './result';

export async function needsSetup() {
  const { ensureEnvAdmin } = await import('@/lib/bootstrap');
  await ensureEnvAdmin();
  return !isDemo && (await store().listProfiles()).length === 0;
}

// First run after deploying: whoever opens the site first creates the admin account.
// Set ADMIN_SETUP_CODE in Vercel to require a code for this step.
export const createFirstAdminAction = guard(async function createFirstAdminAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (!(await needsSetup())) return fail('done');
  const code = process.env.ADMIN_SETUP_CODE;
  if (code && String(form.get('code') ?? '') !== code) return fail('code');
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!USERNAME_PATTERN.test(username)) return fail('usernameInvalid');
  if (password.length < 8) return fail('tooShort');
  if (password !== String(form.get('confirm') ?? '')) return fail('mismatch');
  const id = await createAccount({ username, displayName: String(form.get('displayName') ?? '').trim() || username, jobTitle: '', role: 'admin', password, mustChangePassword: false });
  const offices = await store().listOffices();
  if (offices.some((o) => o.slot === 1 && !o.ownerId)) await store().updateOffice(1, { ownerId: id });
  await signIn(username, password);
  redirect({ href: '/', locale: await getLocale() });
  return { ok: true };
});
