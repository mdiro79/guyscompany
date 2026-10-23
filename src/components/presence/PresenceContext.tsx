'use client';
import { createContext, useContext } from 'react';
import type { Profile, UserStatus } from '@/lib/data/types';

export interface PresenceState {
  // User ids currently connected (any tab/device).
  onlineIds: Set<string>;
  statusOf(p: Profile): UserStatus | 'offline';
}

export const PresenceCtx = createContext<PresenceState>({ onlineIds: new Set(), statusOf: (p) => p.status });
export const usePresence = () => useContext(PresenceCtx);
