'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { KeyRound, Trash2, UserPlus, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useShell } from '@/components/shell/ShellContext';
import { createAccountAction, deleteAccountAction, resetPasswordAction, setRoleAction, assignOfficeAction, runCleanupAction } from '@/app/actions/admin';
import { formatNumber } from '@/lib/format';
import { MAX_MEMBERS } from '@/lib/limits';
import { SaveButton, useResultStatus } from '@/components/ui/SaveButton';

export function AdminView() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user, profiles, offices } = useShell();
  const [note, setNote] = useState('');
  const [, start] = useTransition();
  const [state, action, pending] = useActionState(createAccountAction, null);
  const status = useResultStatus(state);
  useEffect(() => {
    if (state?.ok) setNote(t('created', { password: state.data?.password ?? '' }));
    else if (state?.error) setNote(t.has(state.error as 'usernameTaken') ? t(state.error as 'usernameTaken') : tc('error'));
  }, [state, t, tc]);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; data?: Record<string, string> }>) => start(async () => {
    const r = await fn();
    if (r.message === 'resetDone') setNote(t('resetDone', { password: r.data?.password ?? '' }));
    if (r.message === 'cleanupDone') setNote(t('cleanupDone', { visits: r.data?.visits ?? '0', notifications: r.data?.notifications ?? '0' }));
   
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      {note && <p className="rounded-xl bg-accent-soft p-3 text-sm" dir="auto" role="status">{note}</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('accounts')} <span className="text-sm font-normal text-muted">{formatNumber(locale, profiles.length)}/{formatNumber(locale, MAX_MEMBERS)}</span></h2>
          <ul className="divide-y divide-line">
            {profiles.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar profile={p} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.displayName} <span className="text-xs text-muted" dir="ltr">@{p.username}</span></div>
                  <div className="text-xs text-muted">{p.jobTitle}{p.mustChangePassword && <span className="ms-2 text-accent">· {t('mustChange')}</span>}</div>
                </div>
                <select className="input min-h-10 w-auto" value={p.role} disabled={p.id === user.id} onChange={(e) => run(() => setRoleAction(p.id, e.target.value as 'admin' | 'member'))}>
                  <option value="member">{t('role_member')}</option><option value="admin">{t('role_admin')}</option>
                </select>
                <button type="button" className="btn-ghost min-h-10" onClick={() => run(() => resetPasswordAction(p.id))}><KeyRound className="size-4" />{t('resetPassword')}</button>
                {p.id !== user.id && (
                  <button type="button" className="icon-btn text-muted hover:text-danger" aria-label={tc('delete')}
                    onClick={() => { if (confirm(t('confirmDelete', { name: p.displayName }))) run(() => deleteAccountAction(p.id)); }}><Trash2 className="size-5" /></button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="size-5" />{t('newAccount')}</h2>
          <form action={action} className="space-y-3">
            <div><label className="label">{t('username')}</label><input name="username" required pattern="[a-z0-9_.\-]{3,24}" dir="ltr" autoCapitalize="none" className="input" /><p className="mt-1 text-xs text-muted">{t('usernameInvalid')}</p></div>
            <div><label className="label">{t('displayName')}</label><input name="displayName" className="input" dir="auto" /></div>
            <div><label className="label">{t('jobTitle')}</label><input name="jobTitle" className="input" dir="auto" /></div>
            <div><label className="label">{t('role')}</label><select name="role" className="input"><option value="member">{t('role_member')}</option><option value="admin">{t('role_admin')}</option></select></div>
            <SaveButton className="btn-primary w-full" pending={pending} status={status === 'saved' ? 'saved' : 'idle'} disabled={profiles.length >= MAX_MEMBERS}>{tc('create')}</SaveButton>
            {profiles.length >= MAX_MEMBERS && <p className="text-xs text-muted">{t('maxUsers')}</p>}
          </form>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('offices')}</h2>
          <ul className="space-y-2">
            {offices.map((o) => (
              <li key={o.slot} className="flex items-center gap-3">
                <span className={`flex size-10 items-center justify-center rounded-xl font-bold text-white ${o.wallColor === 'teal' ? 'bg-teal' : 'bg-accent'}`}>{formatNumber(locale, o.slot)}</span>
                <select className="input" value={o.ownerId ?? ''} onChange={(e) => run(() => assignOfficeAction(o.slot, e.target.value || null))}>
                  <option value="">{tc('none')}</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('cleanup')}</h2>
          <button type="button" className="btn-ghost" onClick={() => run(() => runCleanupAction())}><Sparkles className="size-4" />{t('runCleanup')}</button>
        </section>
      </div>
    </div>
  );
}
