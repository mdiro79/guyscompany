import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { PulseView } from '@/components/pages/PulseView';

const WINDOW_DAYS = 60;

// Team pulse: today's standups, kudos and announcements.
export default async function PulsePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePageUser();
  const [{ tab }, posts] = await Promise.all([searchParams, store().listPosts(new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString(), 300)]);
  return <PulseView posts={posts} today={todayIso()} tab={tab} />;
}
