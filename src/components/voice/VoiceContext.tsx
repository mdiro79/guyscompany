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
  // Speaking level 0..1 for a user (read every frame, no re-render).
  getLevel(userId: string): number;
  // Proximity volume 0..1 for a user's voice, set by the 3D office.
  setVolume(userId: string, volume: number): void;
  toggleMic(): void;
  useMicHere(): void;
  toggleMuteAll(): void;
}

const noop = () => {};
export const VoiceCtx = createContext<VoiceState>({
  activeDevice: null, thisDevice: 'computer', micOn: false, allMuted: false, error: null, peerCount: 0,
  getLevel: () => 0, setVolume: noop, toggleMic: noop, useMicHere: noop, toggleMuteAll: noop,
});

export const useVoice = () => useContext(VoiceCtx);
