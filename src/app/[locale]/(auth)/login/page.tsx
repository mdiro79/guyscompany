import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { isDemo } from '@/lib/env';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(`/${await getLocale()}`);
  return <LoginForm demo={isDemo} />;
}
