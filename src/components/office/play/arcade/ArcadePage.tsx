'use client';
import { useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from '@/i18n/navigation';
import type { GameScore } from '@/lib/arcade';
import { refreshScores } from './scores';

const Arcade = dynamic(() => import('./Arcade').then((m) => m.Arcade), { ssr: false });

// The arcade as its own page: the games without walking through the 3D office (handy on a phone).
export function ArcadePage({ scores }: { scores: GameScore[] }) {
  const router = useRouter();
  useEffect(() => { refreshScores(scores); }, [scores]);
  const close = useCallback(() => router.push('/'), [router]);
  return <div className="fixed inset-0"><Arcade onClose={close} /></div>;
}
