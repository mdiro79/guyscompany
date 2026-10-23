'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { changePasswordAction } from '@/app/actions/auth';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">{t('changeTitle')}</h1>
      {forced && <p className="rounded-xl bg-accent-soft p-3 text-sm">{t('changeForced')}</p>}
      <div>
        <label className="label" htmlFor="password">{t('newPassword')}</label>
        <input id="password" name="password" type="password" dir="ltr" minLength={8} autoComplete="new-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{t('confirmPassword')}</label>
        <input id="confirm" name="confirm" type="password" dir="ltr" minLength={8} autoComplete="new-password" required className="input" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{t(state.error as 'mismatch' | 'tooShort')}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t('changeTitle')}</button>
    </form>
  );
}
