'use client';
import { useRouter } from '@/i18n/navigation';
import { BoardApp } from './BoardApp';

// The board as its own page: lets a phone be the drawing pad while the computer is in the office.
export function BoardPage() {
  const router = useRouter();
  return <BoardApp onClose={() => (window.history.length > 1 ? router.back() : router.push('/'))} />;
}
