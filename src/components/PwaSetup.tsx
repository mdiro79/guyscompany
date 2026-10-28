'use client';
import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';
import { isEmbedded } from '@/lib/device';

export function PwaSetup() {
  useEffect(() => { if (!isEmbedded()) startPwa(); }, []);
  return null;
}
