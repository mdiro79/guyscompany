'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Pause, Play } from 'lucide-react';

// Voice messages: recorded in the browser, uploaded like any file, and sent as a message whose text is
// "🎤 m:ss" (readable everywhere, also above the speaker's head in the office) with the file attached.

const VOICE = /^🎤 (\d+):(\d\d)$/;
export const voiceBody = (seconds: number) => `🎤 ${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
/** Length in seconds when the message is a voice message (text "🎤 m:ss" and a file), else null. */
export function voiceSeconds(m: { body: string; fileId: string | null }) {
  const r = m.fileId ? VOICE.exec(m.body) : null;
  return r ? Number(r[1]) * 60 + Number(r[2]) : null;
}
export const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

/** "now", "5 min. ago", "2 hr. ago", or the time of day for older messages. */
export function ago(locale: string, iso: string, now: number) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (s < 45) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

const MAX_SECONDS = 300;
// A format this browser can record and the others can play: AAC in MP4 (iPhone, recent Chrome), else Opus.
const pickType = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';

export type RecorderState = 'idle' | 'starting' | 'recording';

/** Records one voice message at a time; `stop(true)` hands the file to `onDone`, `stop(false)` throws it away. */
export function useVoiceRecorder(onDone: (file: File, seconds: number) => void, onDenied: () => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; keep: boolean } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = useCallback((keep: boolean) => {
    const r = rec.current;
    if (!r) return;
    r.keep = keep;
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onDenied(); return; }
    setState('starting');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { setState('idle'); onDenied(); return; }
    const type = pickType();
    const recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 });
    const r = { recorder, stream, chunks: [] as Blob[], started: performance.now(), keep: false };
    rec.current = r;
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setState('idle'); setSeconds(0);
      const secs = (performance.now() - r.started) / 1000;
      if (!r.keep || secs < 0.8 || !r.chunks.length) return;
      const mime = recorder.mimeType || type || 'audio/webm';
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      done.current(new File(r.chunks, `voice-${Math.round(secs)}s.${ext}`, { type: mime.split(';')[0] }), secs);
    };
    recorder.start(250);
    setState('recording');
  }, [onDenied]);

  useEffect(() => {
    if (state !== 'recording') return;
    const id = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const s = (performance.now() - r.started) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) stop(true);
    }, 200);
    return () => clearInterval(id);
  }, [state, stop]);
  // Leaving the chat while recording throws the recording away and frees the microphone.
  useEffect(() => () => stop(false), [stop]);

  return { state, seconds, start, stop };
}

// One voice message plays at a time.
let playing: { audio: HTMLAudioElement; stop: () => void } | null = null;

/** Play button, progress and length of a voice message (`light`: on a light bubble). */
export function VoicePlayer({ fileId, seconds, light = false, compact = false }: { fileId: string; seconds: number; light?: boolean; compact?: boolean }) {
  const t = useTranslations('chat');
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { if (playing?.audio === audio.current) { playing.stop(); playing = null; } }, []);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (on) { audio.current?.pause(); return; }
    if (!audio.current) {
      const a = new Audio(`/api/files/${fileId}`);
      a.ontimeupdate = () => setAt(a.currentTime);
      a.onpause = () => setOn(false);
      a.onplay = () => setOn(true);
      a.onended = () => { setOn(false); setAt(0); };
      audio.current = a;
    }
    const a = audio.current;
    if (playing && playing.audio !== a) playing.stop();
    playing = { audio: a, stop: () => a.pause() };
    void a.play().catch(() => setOn(false));
  };
  const share = seconds ? Math.min(1, at / seconds) : 0;
  return (
    <span className={clsx('flex items-center gap-2', compact ? 'min-w-28' : 'min-w-44')}>
      <button type="button" onClick={toggle} aria-label={on ? t('pause') : t('play')}
        className={clsx('flex shrink-0 touch-manipulation items-center justify-center rounded-full transition active:scale-90', compact ? 'size-7' : 'size-9',
          light ? 'bg-[#2b241e] text-[#f3e2c4]' : 'bg-white text-[#2b241e]')}>
        {on ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>
      {/* A simple "waveform": bars that fill as it plays. */}
      <span className="flex h-6 flex-1 items-center gap-[3px]" dir="ltr" aria-hidden>
        {Array.from({ length: compact ? 10 : 18 }, (_, i) => (
          <span key={i} className={clsx('w-[3px] rounded-full transition-colors', i / (compact ? 10 : 18) < share ? (light ? 'bg-[#2b241e]' : 'bg-white') : light ? 'bg-[#2b241e]/30' : 'bg-white/35')}
            style={{ height: `${30 + ((i * 37) % 70)}%` }} />
        ))}
      </span>
      <span className={clsx('shrink-0 text-[11px] tabular-nums', light ? 'text-[#2b241e]/60' : 'text-white/60')} dir="ltr">{clockOf(on || at ? at : seconds)}</span>
    </span>
  );
}
