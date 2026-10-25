import { requirePageUser } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { store } from '@/lib/data';
import { TeamGrid } from '@/components/pages/TeamGrid';

export default async function TeamPage() {
  await requirePageUser();
  const t = await getTranslations('team');
  const [profiles, offices, tasks] = await Promise.all([store().listProfiles(), store().listOffices(), store().listTasks()]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <TeamGrid profiles={profiles} offices={offices} tasks={tasks} />
    </div>
  );
}
