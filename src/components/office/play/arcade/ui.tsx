'use client';
import { Component, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Moon, Sparkles, Sun, Volume2, VolumeX, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { sfx } from './kit/sfx';
import { theme, useThemeMode, THEME_MODES, type ThemeMode } from './kit/theme';

// Small pieces shared by the arcade's screens.

export interface Person { id: string; name: string; characterId: string }

export function Portrait({ person, size = 'size-8', ring }: { person: Person | undefined; size?: string; ring?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/models/thumbs/${person?.characterId ?? 'kaykit-mage'}.webp`} alt="" className={clsx(size, 'shrink-0 rounded-full bg-[#f6e3cf] object-cover')} style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined} />;
}

export const useMuted = () => useSyncExternalStore(sfx.subscribe, sfx.muted, sfx.muted);

/** The bar on top of every arcade screen: back, title, things of the screen, sound, close. */
export function TopBar({ title, icon, color, onBack, onClose, rtl, labels, children }: {
  title: string; icon?: string; color?: string; onBack?: () => void; onClose: () => void; rtl: boolean;
  labels: { back: string; close: string; mute: string; unmute: string; theme: string }; children?: ReactNode;
}) {
  const muted = useMuted();
  const mode = useThemeMode();
  const Back = rtl ? ArrowRight : ArrowLeft;
  const blur = (fn: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); fn(); };
  return (
    <div className="flex shrink-0 items-center gap-2 px-safe pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      {onBack && <button type="button" onClick={blur(onBack)} aria-label={labels.back} title={labels.back} className={iconBtn}><Back className="size-5" /></button>}
      {icon && <span className="text-2xl leading-none">{icon}</span>}
      <h2 className="min-w-0 truncate text-base font-black sm:text-lg" style={color ? { color: `color-mix(in oklab, ${color} 78%, var(--a-ink))` } : undefined}>{title}</h2>
      <div className="ms-auto flex min-w-0 items-center gap-2">
        {children}
        <button type="button" onClick={blur(() => theme.set(THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]))} aria-label={labels.theme} title={labels.theme} className={iconBtn}>{mode === 'light' ? <Sun className="size-5" /> : mode === 'dark' ? <Moon className="size-5" /> : <Sparkles className="size-5" />}</button>
        <button type="button" onClick={blur(() => sfx.setMuted(!muted))} aria-label={muted ? labels.unmute : labels.mute} title={muted ? labels.unmute : labels.mute} aria-pressed={muted}
          className={clsx(iconBtn, muted && '!bg-[#ff6b5e] text-[#2b2440]')}>{muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}</button>
        <button type="button" onClick={blur(onClose)} aria-label={labels.close} title={labels.close} className={iconBtn}><X className="size-5" /></button>
      </div>
    </div>
  );
}

/** A game that throws must not take the office down with it. */
export class GameBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.error('[arcade] game failed:', e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export const MEDALS = ['', '🥇', '🥈', '🥉'];
// "Sticker" pieces: an ink edge and a hard little shadow that the piece presses into when tapped.
const sticker = 'border-2 border-[var(--a-edge)] shadow-[0_4px_0_var(--a-edge)]';
export const btn = `flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-extrabold transition-[transform,box-shadow,filter] ${sticker} active:translate-y-[3px] active:shadow-[0_1px_0_var(--a-edge)] disabled:opacity-45 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_var(--a-edge)]`;
export const btnGold = `${btn} bg-[#ffc93c] text-[#2b2440] hover:brightness-105`;
export const btnSoft = `${btn} bg-[var(--a-card)] text-[var(--a-ink)] hover:brightness-105`;
export const card = `rounded-2xl bg-[var(--a-card)] p-3 ${sticker}`;
export const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--a-edge)] bg-[var(--a-card)] shadow-[0_3px_0_var(--a-edge)] transition-[transform,box-shadow] active:translate-y-[2px] active:shadow-[0_1px_0_var(--a-edge)]';

/** CSS variables of the arcade's screens for the chosen look. */
export function themeVars(mode: ThemeMode): React.CSSProperties {
  const v: Record<string, string> = mode === 'neon'
    ? { '--a-bg': '#0b0d24', '--a-bg2': '#1a1040', '--a-ink': '#eef0ff', '--a-soft': 'rgba(238,240,255,.66)', '--a-chip': 'rgba(120,140,255,.14)', '--a-chip2': 'rgba(120,140,255,.26)', '--a-card': '#181b45', '--a-panel': '#14173a', '--a-line': 'rgba(120,140,255,.22)', '--a-edge': '#7c5cff', '--a-good': '#3dff8b', '--a-gold': '#ffd23f', '--a-sky': '#35e0ff', '--a-coral': '#ff6f88', '--a-veil': 'rgba(11,13,36,.84)', '--a-sun-soft': 'rgba(255,210,63,.18)', '--a-blob1': 'rgba(124,92,255,.45)', '--a-blob2': 'rgba(53,224,255,.2)', '--a-blob3': 'rgba(255,79,163,.3)' }
    : mode === 'dark'
    ? { '--a-bg': '#1c1733', '--a-bg2': '#2a1f47', '--a-ink': '#fff5e6', '--a-soft': 'rgba(255,245,230,.66)', '--a-chip': 'rgba(255,255,255,.1)', '--a-chip2': 'rgba(255,255,255,.18)', '--a-card': '#33295a', '--a-panel': '#2c2350', '--a-line': 'rgba(255,245,230,.14)', '--a-edge': '#0e0a1c', '--a-good': '#5fe0a5', '--a-gold': '#ffc93c', '--a-sky': '#8fd0ff', '--a-coral': '#ff8f85', '--a-veil': 'rgba(28,23,51,.82)', '--a-sun-soft': 'rgba(255,201,60,.2)', '--a-blob1': '#3a2a63', '--a-blob2': '#22365c', '--a-blob3': '#472a52' }
    : { '--a-bg': '#fff6e6', '--a-bg2': '#ffe6cf', '--a-ink': '#2b2440', '--a-soft': 'rgba(43,36,64,.64)', '--a-chip': 'rgba(43,36,64,.08)', '--a-chip2': 'rgba(43,36,64,.16)', '--a-card': '#ffffff', '--a-panel': '#fffaf1', '--a-line': 'rgba(43,36,64,.16)', '--a-edge': '#2b2440', '--a-good': '#12915f', '--a-gold': '#c47f00', '--a-sky': '#1d7fd6', '--a-coral': '#e04a3c', '--a-veil': 'rgba(255,246,230,.84)', '--a-sun-soft': 'rgba(255,201,60,.32)', '--a-blob1': '#ffd9b8', '--a-blob2': '#cdeeff', '--a-blob3': '#ffd3e4' };
  return v as React.CSSProperties;
}
