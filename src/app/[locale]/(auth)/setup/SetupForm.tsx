'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { createFirstAdminAction } from '@/app/actions/setup';

export function SetupForm({ askCode }: { askCode: boolean }) {
  const t = useTranslations('setup');
  const ta = useTranslations('auth');
  const [state, action, pending] = useActionState(createFirstAdminAction, null);
  const errors: Record<string, string> = { code: t('badCode'), usernameInvalid: t('usernameInvalid'), tooShort: ta('tooShort'), mismatch: ta('mismatch'), done: t('done') };
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">{t('title')}</h1>
      <p className="rounded-xl bg-accent-soft p-3 text-sm">{t('intro')}</p>
      {askCode && <div><label className="label" htmlFor="code">{t('code')}</label><input id="code" name="code" dir="ltr" required className="input" /></div>}
      <div><label className="label" htmlFor="username">{ta('username')}</label><input id="username" name="username" dir="ltr" autoCapitalize="none" required pattern="[a-z0-9_.\-]{3,24}" className="input" /></div>
      <div><label className="label" htmlFor="displayName">{t('displayName')}</label><input id="displayName" name="displayName" dir="auto" className="input" /></div>
      <div><label className="label" htmlFor="password">{ta('password')}</label><input id="password" name="password" type="password" dir="ltr" minLength={8} required autoComplete="new-password" className="input" /></div>
      <div><label className="label" htmlFor="confirm">{ta('confirmPassword')}</label><input id="confirm" name="confirm" type="password" dir="ltr" minLength={8} required autoComplete="new-password" className="input" /></div>
      {state?.error && <p role="alert" className="text-sm text-danger">{errors[state.error] ?? state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t('create')}</button>
    </form>
  );
}
