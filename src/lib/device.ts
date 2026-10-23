'use client';
import { useEffect, useState } from 'react';

export function detectDevice(): 'phone' | 'computer' {
  if (typeof navigator === 'undefined') return 'computer';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'phone' : 'computer';
}

export const isTouch = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

// The dashboard shown on a 3D monitor runs in an iframe and must not join presence or voice.
export const isEmbedded = () => typeof window === 'undefined' || window.self !== window.top;


// Hydration-safe device detection: 'computer' on the server and first render, then the real value.
export function useDevice(): 'phone' | 'computer' {
  const [d, setD] = useState<'phone' | 'computer'>('computer');
  useEffect(() => setD(detectDevice()), []);
  return d;
}
