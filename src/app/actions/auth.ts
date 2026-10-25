'use server';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { signIn, signOut, changeOwnPassword, requireUser } from '@/lib/auth';
import { fail, okResult, guard, type ActionResult } from './result';

export const loginAction = guard(async function loginAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  let user;
  try {
    user = await signIn(username, password);
  } catch (e) {
    console.error('[login] sign-in failed:', e);
    return fail('server', { username });
  }
  if (!user) return fail('invalid', { username });
  const locale = await getLocale();
  redirect({ href: user.mustChangePassword ? '/change-password' : '/', locale });
  return { ok: true };
});

export const logoutAction = guard(async function logoutAction() {
  await signOut();
  redirect({ href: '/login', locale: await getLocale() });
});

export const changePasswordAction = guard(async function changePasswordAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return fail('tooShort');
  if (password !== String(form.get('confirm') ?? '')) return fail('mismatch');
  await changeOwnPassword(user, password);
  // The forced first-login change continues to the app; from settings the member stays where they are.
  if (form.get('forced') === '1') redirect({ href: '/', locale: await getLocale() });
  return okResult('changed');
});
