import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { needsSetup } from '@/app/actions/setup';
import { configProblems } from '@/lib/env';
import { describeDbError } from '@/lib/db-errors';
import { SetupNotice } from '@/components/SetupNotice';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const missing = configProblems();
  if (missing.length) return <SetupNotice kind="config" missing={missing} />;
  let needed: boolean;
  try {
    needed = await needsSetup();
  } catch (e) {
    console.error('[setup] database check failed:', e);
    return <SetupNotice kind="database" {...describeDbError(e)} />;
  }
  if (!needed) redirect(`/${await getLocale()}/login`);
  return <SetupForm askCode={!!process.env.ADMIN_SETUP_CODE} />;
}
