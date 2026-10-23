import { requirePageUser } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await requirePageUser();
  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
