'use client';
import type { ReactNode } from 'react';
import { VoiceCtx } from './VoiceContext';
import { useContext } from 'react';

// Replaced by the WebRTC implementation in the voice stage.
export function VoiceProvider({ children }: { children: ReactNode }) {
  const value = useContext(VoiceCtx);
  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}
