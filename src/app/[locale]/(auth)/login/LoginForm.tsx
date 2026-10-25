'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { loginAction } from '@/app/actions/auth';
import { ProgressBar, useEasedProgress } from '@/components/ui/ProgressBar';

export function LoginForm({ demo, customAdmin }: { demo: boolean; customAdmin: boolean }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState(loginAction, null);
  // Stays pending through the redirect, so the bar keeps going until the dashboard is on screen.
  const percent = useEasedProgress(pending);
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label className="label" htmlFor="username">{t('username')}</label>
          <input id="username" name="username" dir="ltr" autoComplete="username" autoCapitalize="none" required className="input"
            defaultValue={state?.data?.username ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="password">{t('password')}</label>
          <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required className="input" />
        </div>
      </fieldset>
      {state?.error && !pending && <p role="alert" className="text-sm text-danger">{t(state.error === 'server' ? 'serverError' : 'invalid')}</p>}
      {pending
        ? <ProgressBar percent={percent} label={percent < 45 ? t('signingIn') : t('openingDashboard')} />
        : <button className="btn-primary w-full">{t('signIn')}</button>}
      <p className="text-xs text-muted">{t('noSignup')}</p>
      {demo && !customAdmin && <p className="rounded-xl bg-accent-soft p-3 text-xs">{t('demoHint', { password: 'guys1234' })}</p>}
    </form>
  );
}
