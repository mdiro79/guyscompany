import { requirePageUser } from '@/lib/auth';
import { store } from '@/lib/data';
import { FilesView } from '@/components/pages/FilesView';

export default async function FilesPage() {
  await requirePageUser();
  return <FilesView files={await store().listFiles()} />;
}
