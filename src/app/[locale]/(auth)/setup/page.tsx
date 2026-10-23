import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { needsSetup } from '@/app/actions/setup';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await needsSetup())) redirect(`/${await getLocale()}/login`);
  return <SetupForm askCode={!!process.env.ADMIN_SETUP_CODE} />;
}
