'use client';
import { createContext, useContext } from 'react';

export type MicDevice = 'phone' | 'computer';

export interface VoiceState {
  // Which of the user's devices owns the single active microphone (null = none).
  activeDevice: MicDevice | null;
  thisDevice: MicDevice;
  micOn: boolean;
  allMuted: boolean;
  error: string | null;
  peerCount: number;
  // Speaking level 0..1 per user id (local + remote).
  levels: Record<string, number>;
  toggleMic(): void;
  useMicHere(): void;
  toggleMuteAll(): void;
}

const noop = () => {};
export const VoiceCtx = createContext<VoiceState>({
  activeDevice: null, thisDevice: 'computer', micOn: false, allMuted: false, error: null, peerCount: 0, levels: {},
  toggleMic: noop, useMicHere: noop, toggleMuteAll: noop,
});

export const useVoice = () => useContext(VoiceCtx);
