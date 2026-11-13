import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { ArcadePage } from '@/components/office/play/arcade/ArcadePage';

export default async function Arcade() {
  await requirePageUser();
  return <ArcadePage scores={await store().listGameScores()} />;
}
