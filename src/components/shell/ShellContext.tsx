'use client';
import { createContext, useContext } from 'react';
import type { Profile, Office } from '@/lib/data/types';

export interface ShellData {
  user: Profile;
  profiles: Profile[];
  offices: Office[];
  demo: boolean;
  /** Shows a change to the signed-in user at once, before the server confirms it (null drops it). */
  patchUser?: (patch: Partial<Profile> | null) => void;
}

const Ctx = createContext<ShellData | null>(null);

export const ShellProvider = Ctx.Provider;

export function useShell() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useShell outside ShellProvider');
  return v;
}

export function useProfile(id: string | null | undefined) {
  const { profiles } = useShell();
  return profiles.find((p) => p.id === id) ?? null;
}
