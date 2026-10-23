'use client';
import { useRef, useState } from 'react';
import { input } from './store';

// Virtual joystick (bottom-left) and drag-to-look on the rest of the screen.
export function TouchControls({ lookOnly = false }: { lookOnly?: boolean }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const stick = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 52;
  return (
    <div className="absolute inset-0 z-10 touch-none select-none" dir="ltr"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const leftHalf = e.clientX < window.innerWidth * 0.45 && e.clientY > window.innerHeight * 0.45;
        if (leftHalf && !lookOnly && !stick.current) { stick.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY }; setKnob({ x: 0, y: 0 }); }
        else if (!look.current) look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (stick.current?.id === e.pointerId) {
          let dx = e.clientX - stick.current.cx, dy = e.clientY - stick.current.cy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
          setKnob({ x: dx, y: dy });
          input.right = dx / R;
          input.forward = -dy / R;
          input.run = d > R * 0.95;
        } else if (look.current?.id === e.pointerId) {
          input.lookDX += e.clientX - look.current.x;
          input.lookDY += e.clientY - look.current.y;
          look.current.x = e.clientX; look.current.y = e.clientY;
        }
      }}
      onPointerUp={(e) => {
        if (stick.current?.id === e.pointerId) { stick.current = null; setKnob(null); input.forward = input.right = 0; input.run = false; }
        if (look.current?.id === e.pointerId) look.current = null;
      }}
      onPointerCancel={() => { stick.current = null; look.current = null; setKnob(null); input.forward = input.right = 0; }}>
      {!lookOnly && <div className="pointer-events-none absolute bottom-8 left-6 flex size-32 short:bottom-4 short:size-28 items-center justify-center rounded-full border-2 border-white/40 bg-black/20"
        style={stick.current ? { left: stick.current.cx - 64, top: stick.current.cy - 64, bottom: 'auto' } : undefined}>
        <div className="size-14 rounded-full bg-white/70 shadow" style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }} />
      </div>}
    </div>
  );
}
