import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { requirePageUser } from '@/lib/auth';
import { AdminView } from '@/components/pages/AdminView';

export default async function AdminPage() {
  const user = await requirePageUser();
  if (user.role !== 'admin') redirect(`/${await getLocale()}`);
  return <AdminView />;
}
