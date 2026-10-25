'use client';
import { useEffect, useRef, useState } from 'react';
import { formatDate, formatNumber } from '@/lib/format';

// Small charts of the project command center, drawn in SVG with the validated chart tokens
// (--viz-*): blue = tasks, orange = bugs; task status as one blue ramp from idea to done.
// Every chart has a legend with the numbers next to its colours and a hover read-out.

interface TrendProps { locale: string; days: string[]; series: { label: string; color: string; values: number[] }[] }

// Daily counts as lines with a crosshair and tooltip.
export function TrendChart({ locale, days, series }: TrendProps) {
  const [hover, setHover] = useState<number | null>(null);
  // The drawing is sized to its box in CSS pixels so tick labels stay readable on phones.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 150 : 180, L = 26, R = 8, T = 10, B = 24;
  const every = W < 480 ? 4 : 2;
  const max = Math.max(2, ...series.flatMap((s) => s.values));
  const top = Math.ceil(max / 2) * 2;
  const x = (i: number) => L + (i / Math.max(1, days.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, top / 2, top];
  const day = (d: string, o: Intl.DateTimeFormatOptions) => formatDate(locale, `${d}T12:00:00Z`, o);
  return (
    <div className="relative min-w-0" ref={box}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />{s.label}
            <span className="font-semibold text-ink">{formatNumber(locale, s.values.reduce((a, b) => a + b, 0))}</span>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" style={{ direction: 'ltr' }} role="img"
        aria-label={series.map((s) => `${s.label}: ${s.values.join(', ')}`).join('; ')} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={L - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">{formatNumber(locale, v)}</text>
          </g>
        ))}
        {days.map((d, i) => (days.length - 1 - i) % every === 0 && (
          <text key={d} x={x(i)} y={H - 6} textAnchor={i === days.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">{day(d, { day: 'numeric', month: 'short' })}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        ))}
        {days.map((d, i) => (
          <rect key={d} x={x(i) - (W - L - R) / days.length / 2} y={T} width={(W - L - R) / days.length} height={H - T - B} fill="transparent"
            onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-6 z-10 min-w-36 rounded-xl border border-line bg-surface p-2 text-xs shadow-lg"
          style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 4.5rem), calc(100% - 9rem))` }}>
          <div className="mb-1 font-semibold">{day(days[hover], { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}
              <span className="ms-auto font-semibold">{formatNumber(locale, s.values[hover])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One segmented bar (2px gaps) for parts of a whole, with a legend that carries the counts.
export function StackBar({ locale, parts }: { locale: string; parts: { label: string; color: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')} onMouseLeave={() => setHover(null)}>
        {total === 0 ? <div className="h-full flex-1 rounded-full bg-surface-2" /> : parts.filter((p) => p.value > 0).map((p) => {
          const i = parts.indexOf(p);
          return <div key={p.label} className="h-full first:rounded-s-full last:rounded-e-full transition-opacity" onMouseEnter={() => setHover(i)}
            style={{ flexGrow: p.value, background: p.color, opacity: hover === null || hover === i ? 1 : 0.45 }} />;
        })}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {parts.map((p, i) => (
          <li key={p.label} className={`flex items-center gap-1.5 ${hover === i ? 'font-semibold' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} /><span className="text-muted">{p.label}</span>
            <span className="ms-auto">{formatNumber(locale, p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Thin horizontal bar for a count against the largest one in its list.
export function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color, minWidth: value ? 6 : 0 }} />
    </div>
  );
}
