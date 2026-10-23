export function detectDevice(): 'phone' | 'computer' {
  if (typeof navigator === 'undefined') return 'computer';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'phone' : 'computer';
}

export const isTouch = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
