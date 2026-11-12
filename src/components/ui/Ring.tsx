import type { ReactNode } from 'react';

// A round progress gauge (0–100) with whatever goes in the middle; an optional second, thinner inner
// ring shows a second share (e.g. time passed beside work done).
export function Ring({ value, inner, size = 64, color = 'var(--brand)', innerColor = 'var(--accent)', children, label }: {
  value: number; inner?: number | null; size?: number; color?: string; innerColor?: string; children?: ReactNode; label?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const ri = 32;
  const ci = 2 * Math.PI * ri;
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.3,1,.5,1)' }} />
        {inner != null && <>
          <circle cx="50" cy="50" r={ri} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
          <circle cx="50" cy="50" r={ri} fill="none" stroke={innerColor} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={ci} strokeDashoffset={ci * (1 - Math.max(0, Math.min(100, inner)) / 100)} />
        </>}
      </svg>
      <span className="relative text-center leading-none">{children}</span>
    </span>
  );
}
