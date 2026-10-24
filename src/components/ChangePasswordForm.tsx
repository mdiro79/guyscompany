'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { changePasswordAction } from '@/app/actions/auth';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const [state, action, pending] = useActionState(changePasswordAction, null);
  const status = useResultStatus(state);
  const known = state?.error === 'mismatch' || state?.error === 'tooShort';
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">{t('changeTitle')}</h1>
      {forced && <p className="rounded-xl bg-accent-soft p-3 text-sm">{t('changeForced')}</p>}
      <input type="hidden" name="forced" value={forced ? '1' : '0'} />
      <div>
        <label className="label" htmlFor="password">{t('newPassword')}</label>
        <input id="password" name="password" type="password" dir="ltr" minLength={8} autoComplete="new-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{t('confirmPassword')}</label>
        <input id="confirm" name="confirm" type="password" dir="ltr" minLength={8} autoComplete="new-password" required className="input" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{known ? t(state.error as 'mismatch' | 'tooShort') : tc('error')}</p>}
      {state?.ok && <p role="status" className="text-sm text-brand">{t('changed')}</p>}
      <SaveButton pending={pending} status={known ? 'idle' : status} className="btn-primary w-full">{t('changeTitle')}</SaveButton>
    </form>
  );
}
