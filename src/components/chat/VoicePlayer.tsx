'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play, Pause } from 'lucide-react';

const BARS = 28;
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

// A voice note: play/pause, a waveform that fills as it plays (tap it to seek) and the time.
export function VoicePlayer({ src, mine }: { src: string; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  // A stable made-up waveform per note (the real one would need decoding the whole file).
  const bars = useMemo(() => {
    let h = 0;
    for (const ch of src) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: BARS }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return 0.25 + ((h >>> 16) % 100) / 133 + (i % 5 === 2 ? 0.1 : 0); });
  }, [src]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const on = () => setPlaying(!a.paused);
    const tick = () => setTime(a.currentTime);
    // Recorded WebM notes report an unknown length until read once to the end.
    const meta = () => {
      if (Number.isFinite(a.duration)) { setLength(a.duration); return; }
      a.currentTime = 1e6;
      a.addEventListener('timeupdate', function fix() { a.removeEventListener('timeupdate', fix); setLength(a.duration); a.currentTime = 0; }, { once: true });
    };
    const end = () => { setPlaying(false); setTime(0); };
    a.addEventListener('play', on); a.addEventListener('pause', on); a.addEventListener('timeupdate', tick); a.addEventListener('loadedmetadata', meta); a.addEventListener('ended', end);
    return () => { a.removeEventListener('play', on); a.removeEventListener('pause', on); a.removeEventListener('timeupdate', tick); a.removeEventListener('loadedmetadata', meta); a.removeEventListener('ended', end); };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { document.querySelectorAll('audio').forEach((x) => { if (x !== a) x.pause(); }); void a.play(); } else a.pause();
  };
  const share = length ? time / length : 0;

  return (
    <div className="my-1 flex w-60 max-w-full items-center gap-2.5" onPointerDown={(e) => e.stopPropagation()}>
      <audio ref={audio} src={src} preload="metadata" />
      <button type="button" onClick={toggle} aria-label={playing ? 'pause' : 'play'}
        className={clsx('flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow transition active:scale-90', mine ? 'bg-[#2f8a55]' : 'bg-brand')}>
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current rtl:-scale-x-100" />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" dir="ltr" className="flex h-7 w-full items-center gap-[2px]" aria-label="seek"
          onClick={(e) => { const a = audio.current; if (!a || !length) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * length; }}>
          {bars.map((v, i) => (
            <span key={i} className={clsx('w-[3px] flex-1 rounded-full transition-colors', i / BARS < share ? (mine ? 'bg-[#2f8a55]' : 'bg-brand') : 'bg-muted/35')} style={{ height: `${Math.min(1, v) * 100}%` }} />
          ))}
        </button>
        <div className="text-[11px] text-muted" dir="ltr">{clock(playing || time ? time : length)}</div>
      </div>
    </div>
  );
}
