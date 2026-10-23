'use client';
import { useEffect, useRef } from 'react';

const CLICKABLE = 'button,a,select,input,textarea,label,[role=button]';

// Brand-styled pointer for the office (shown on computers when the mouse is free, e.g. after Tab):
// an orange arrow with a teal ring that trails behind, grows over buttons and pulses on click.
export function TabCursor() {
  const arrow = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const pulse = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let x = -100, y = -100, rx = -100, ry = -100, hover = false, raf = 0, visible = false;
    const move = (e: MouseEvent) => {
      x = e.clientX; y = e.clientY;
      if (!visible) { visible = true; rx = x; ry = y; if (arrow.current) arrow.current.style.opacity = '1'; if (ring.current) ring.current.style.opacity = '1'; }
      hover = !!(e.target as HTMLElement)?.closest?.(CLICKABLE);
    };
    const leave = () => { visible = false; if (arrow.current) arrow.current.style.opacity = '0'; if (ring.current) ring.current.style.opacity = '0'; };
    const down = () => {
      const p = pulse.current;
      if (!p) return;
      p.style.left = `${x}px`; p.style.top = `${y}px`;
      const c = p.firstElementChild as HTMLElement;
      c.classList.remove('gc-cursor-pulse'); void c.offsetWidth; c.classList.add('gc-cursor-pulse');
    };
    const tick = () => {
      rx += (x - rx) * 0.22; ry += (y - ry) * 0.22;
      if (arrow.current) arrow.current.style.transform = `translate(${x}px, ${y}px)`;
      if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${hover ? 1.6 : 1})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', down);
    document.addEventListener('mouseleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      document.removeEventListener('mouseleave', leave);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
      <div ref={ring} className="absolute top-0 left-0 size-9 rounded-full border-2 border-[#3fb3ad] bg-[#3fb3ad]/15 opacity-0 shadow-[0_0_14px_rgba(63,179,173,0.55)] transition-opacity duration-200" />
      <div ref={pulse} className="absolute size-10 -translate-x-1/2 -translate-y-1/2"><div className="size-full rounded-full border-2 border-[#f07a2a] opacity-0" /></div>
      <div ref={arrow} className="absolute top-0 left-0 opacity-0">
        <svg width="26" height="30" viewBox="0 0 26 30" className="gc-cursor-in -translate-x-[3px] -translate-y-[2px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]">
          <path d="M3 2 L23 15 L14 17 L18.5 26.5 L14.8 28 L10.5 18.5 L3.5 24 Z" fill="#f07a2a" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
