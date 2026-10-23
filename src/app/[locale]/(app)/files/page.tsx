import { store } from '@/lib/data';
import { FilesView } from '@/components/pages/FilesView';

export default async function FilesPage() {
  return <FilesView files={await store().listFiles()} />;
}
