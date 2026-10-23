'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { loginAction } from '@/app/actions/auth';

export function LoginForm({ demo, customAdmin }: { demo: boolean; customAdmin: boolean }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <div>
        <label className="label" htmlFor="username">{t('username')}</label>
        <input id="username" name="username" dir="ltr" autoComplete="username" autoCapitalize="none" required className="input"
          defaultValue={state?.data?.username ?? ''} />
      </div>
      <div>
        <label className="label" htmlFor="password">{t('password')}</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && <p role="alert" className="text-sm text-danger">{t(state.error === 'server' ? 'serverError' : 'invalid')}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t('signIn')}</button>
      <p className="text-xs text-muted">{t('noSignup')}</p>
      {demo && !customAdmin && <p className="rounded-xl bg-accent-soft p-3 text-xs">{t('demoHint', { password: 'guys1234' })}</p>}
    </form>
  );
}
