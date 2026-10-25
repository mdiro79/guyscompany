import { requirePageUser } from '@/lib/auth';
import { BoardPage } from '@/components/board/BoardPage';

export default async function Board() {
  await requirePageUser();
  return <BoardPage />;
}
