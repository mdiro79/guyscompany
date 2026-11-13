'use client';
import { useSyncExternalStore } from 'react';

// Phones: the on-screen keyboard covers the bottom of the page without resizing it (iOS, and Android by
// default). The part still visible is tracked here as CSS variables on <html>: --vvh (its height) and
// --vv-top (how far the browser moved it down to show the field being typed in), plus the class gc-kb
// while a keyboard is open, so panels can shrink into the visible part instead of hiding behind it.
// Pages that must stay still like an app (the office and the board mark <html> with gc-lock) are put
// back in place whenever the keyboard closes, the phone turns or the browser scrolled them anyway, so
// nothing stays shifted or out of reach after typing.

let open = false;
let started = false;
let tallest = 0; // tallest visible height seen in this orientation (the height without a keyboard)
let width = 0;
const listeners = new Set<() => void>();
// The keyboard's height last time, per orientation: when a field is tapped again the page moves to where
// the keyboard will end up at once, together with the keyboard's own slide, instead of after it (iOS
// reports the new size only once the keyboard is fully up).
const guesses = new Map<'portrait' | 'landscape', number>();
let predictedUntil = 0;
const orientation = () => (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');

const TYPES_WITHOUT_KEYBOARD = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image', 'hidden']);
function typing(el: Element | null) {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !TYPES_WITHOUT_KEYBOARD.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

const locked = () => document.documentElement.classList.contains('gc-lock');
function settle() {
  if (locked() && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
}

function update() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const unzoomed = vv ? vv.height * Math.max(1, vv.scale) : h; // a pinch zoom is not a keyboard
  const w = vv ? vv.width * Math.max(1, vv.scale) : window.innerWidth;
  // Turning the phone changes the width: start measuring the full height again.
  if (Math.abs(w - width) > 40) { width = w; tallest = 0; }
  tallest = Math.max(tallest, unzoomed, root.clientHeight);
  const isTyping = typing(document.activeElement);
  const keyboard = tallest - unzoomed;
  if (isTyping && keyboard > 120) { guesses.set(orientation(), keyboard); predictedUntil = 0; }
  // The keyboard is still sliding in: keep the predicted size until it reports its real one.
  else if (isTyping && performance.now() < predictedUntil) return;
  root.style.setProperty('--vvh', `${Math.round(h)}px`);
  root.style.setProperty('--vv-top', `${Math.round(vv ? vv.offsetTop : 0)}px`);
  setOpen(isTyping && keyboard > 120);
}

function setOpen(next: boolean) {
  if (next === open) return;
  open = next;
  document.documentElement.classList.toggle('gc-kb', open);
  listeners.forEach((l) => l());
  if (!open) { settle(); setTimeout(settle, 350); }
}

// A field was just tapped: move to where the keyboard will be (if it was seen before in this orientation).
function predict() {
  const guess = guesses.get(orientation());
  if (open || !guess || !typing(document.activeElement)) return;
  predictedUntil = performance.now() + 900;
  const root = document.documentElement;
  root.style.setProperty('--vvh', `${Math.round(Math.max(120, tallest - guess))}px`);
  root.style.setProperty('--vv-top', '0px');
  setOpen(true);
  // No keyboard came after all (e.g. a hardware keyboard): look again once the prediction runs out.
  setTimeout(update, 950);
}

/** Starts tracking the visible part of the screen (once, from the root layout). */
export function startViewport() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const vv = window.visualViewport;
  let raf = 0;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  vv?.addEventListener('resize', soon);
  vv?.addEventListener('scroll', soon);
  window.addEventListener('resize', soon);
  window.addEventListener('orientationchange', () => { setTimeout(() => { update(); settle(); }, 300); });
  document.addEventListener('focusin', () => { predict(); soon(); });
  // Focus moves (or leaves) only after the event: look a moment later.
  document.addEventListener('focusout', () => setTimeout(update, 60));
  // The browser scrolled a page that must not scroll (e.g. to show a field, then kept it there).
  window.addEventListener('scroll', () => { if (!open) settle(); }, { passive: true });
  // iOS pinch zoom gestures on a locked page (two fingers on the joystick and the view) would zoom the
  // whole app and leave buttons off screen.
  const noPinch = (e: Event) => { if (locked()) e.preventDefault(); };
  document.addEventListener('gesturestart', noPinch);
  document.addEventListener('gesturechange', noPinch);
  update();
}

/** Whether an on-screen keyboard is open (a field is being typed in and the visible part shrank). */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => open,
    () => false,
  );
}
