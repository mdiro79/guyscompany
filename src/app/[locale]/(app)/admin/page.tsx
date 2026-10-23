import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { currentUser } from '@/lib/auth';
import { AdminView } from '@/components/pages/AdminView';

export default async function AdminPage() {
  const user = await currentUser();
  if (user?.role !== 'admin') redirect(`/${await getLocale()}`);
  return <AdminView />;
}
