import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { isDemo } from '@/lib/env';
import { LoginForm } from './LoginForm';
import { needsSetup } from '@/app/actions/setup';

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(`/${await getLocale()}`);
  if (await needsSetup()) redirect(`/${await getLocale()}/setup`);
  return <LoginForm demo={isDemo} />;
}
