'use client';
import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';
import { isEmbedded } from '@/lib/device';
import { startViewport } from '@/lib/viewport';

export function PwaSetup() {
  useEffect(() => { startViewport(); if (!isEmbedded()) startPwa(); }, []);
  return null;
}
