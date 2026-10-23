import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { configProblems, isDemo } from '@/lib/env';
import { describeDbError } from '@/lib/db-errors';
import { SetupNotice } from '@/components/SetupNotice';
import { LoginForm } from './LoginForm';
import { needsSetup } from '@/app/actions/setup';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const missing = configProblems();
  if (missing.length) return <SetupNotice kind="config" missing={missing} />;
  let next: 'home' | 'setup' | null = null;
  try {
    if (await currentUser()) next = 'home';
    else if (await needsSetup()) next = 'setup';
  } catch (e) {
    console.error('[login] database check failed:', e);
    return <SetupNotice kind="database" {...describeDbError(e)} />;
  }
  if (next) redirect(`/${await getLocale()}${next === 'setup' ? '/setup' : ''}`);
  return <LoginForm demo={isDemo} customAdmin={!!process.env.ADMIN_USERNAME} />;
}
