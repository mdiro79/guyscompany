import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { SettingsView } from '@/components/pages/SettingsView';

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [swaps, invites] = await Promise.all([store().listSwapRequests(user.id), store().listInvites(user.id)]);
  return <SettingsView swaps={swaps} invites={invites} />;
}
