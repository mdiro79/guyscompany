'use client';
import { useSyncExternalStore } from 'react';

// Chrome/Edge (Android, Windows) fire this when the site can be installed; it is kept until the user asks.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let started = false;
// Registers the service worker and starts listening for the install prompt. Called once from the root layout.
export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[pwa] service worker registration failed:', e));
  }
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual';

function snapshot(): InstallState {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  return isIOS() ? 'ios' : 'manual';
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    snapshot,
    () => 'manual',
  );
}

export async function promptInstall() {
  const e = deferred;
  if (!e) return;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  if (outcome === 'accepted') installed = true;
  emit();
}
