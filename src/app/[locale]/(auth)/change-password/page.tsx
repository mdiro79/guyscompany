import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect(`/${await getLocale()}/login`);
  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
