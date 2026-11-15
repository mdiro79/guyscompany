'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import {
  Camera, Images, MessageCircle, ListChecks, FolderKanban, CalendarDays, Users, FileText, Lightbulb, Settings, Gamepad2, Map as MapIcon, PenLine, Presentation,
  ChevronLeft, X, SwitchCamera, Grid3x3, Timer, RectangleHorizontal, RectangleVertical, Trash2, Download, Loader2, Wifi, BatteryFull,
} from 'lucide-react';
import { gestures, phone, takePhoto, usePhone, viewfinder, ZOOMS, STICK, type Shot } from './phone';
import { GESTURES } from './gestures';

interface PhotoRow { id: string; size: number; width: number; height: number; createdAt: string }
interface Gallery { photos: PhotoRow[]; used: number; quota: number }

const WEB_APPS = [
  { id: 'chat', path: '/chat', icon: MessageCircle, color: 'from-[#34c759] to-[#1f9d47]' },
  { id: 'tasks', path: '/tasks', icon: ListChecks, color: 'from-[#ff9f0a] to-[#e07a00]' },
  { id: 'projects', path: '/projects', icon: FolderKanban, color: 'from-[#5e5ce6] to-[#3f3db8]' },
  { id: 'calendar', path: '/calendar', icon: CalendarDays, color: 'from-[#ff453a] to-[#c9302c]' },
  { id: 'meetings', path: '/meetings', icon: Presentation, color: 'from-[#bf5af2] to-[#8e3bc0]' },
  { id: 'files', path: '/files', icon: FileText, color: 'from-[#64d2ff] to-[#2a9fd6]' },
  { id: 'ideas', path: '/ideas', icon: Lightbulb, color: 'from-[#ffd60a] to-[#e0b400]' },
  { id: 'team', path: '/team', icon: Users, color: 'from-[#30d158] to-[#1a9e43]' },
  { id: 'settings', path: '/settings', icon: Settings, color: 'from-[#8e8e93] to-[#636366]' },
] as const;

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * The office phone on the screen: a large touch phone with the site's sections as apps, a camera and a
 * gallery. `onOffice` opens office things (the map, the arcade, the drawing board).
 */
export function PhoneOverlay({ isPhone, onOffice }: { isPhone: boolean; onOffice: (what: 'map' | 'arcade' | 'board') => void }) {
  const t = useTranslations('office.phone');
  const locale = useLocale();
  const s = usePhone();
  const [time, setTime] = useState(clock);
  useEffect(() => { const id = setInterval(() => setTime(clock()), 15000); return () => clearInterval(id); }, []);
  const home = () => phone.set({ app: 'home', web: null });
  const close = () => phone.set({ open: false });
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (phone.get().app !== 'home') home(); else close(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  if (!s.open) return null;
  const dark = s.app === 'camera';

  return (
    <div className={clsx('gc-hud pointer-events-auto absolute z-[60] flex flex-col overflow-hidden border-[#111] bg-[#111] shadow-[0_20px_60px_rgba(0,0,0,0.55)]',
      isPhone ? 'inset-[max(env(safe-area-inset-top),0.5rem)_max(env(safe-area-inset-right),0.5rem)_max(env(safe-area-inset-bottom),0.5rem)_max(env(safe-area-inset-left),0.5rem)] rounded-[2rem] border-[6px]'
        : 'bottom-4 end-4 h-[min(46rem,calc(100dvh-2rem))] w-[min(23rem,calc(100vw-2rem))] rounded-[2.8rem] border-[10px]')}
      role="dialog" aria-label={t('title')}>
      <div className={clsx('relative flex min-h-0 flex-1 flex-col overflow-hidden', isPhone ? 'rounded-[1.6rem]' : 'rounded-[2.2rem]', dark ? 'bg-black text-white' : 'bg-gradient-to-b from-[#1b2a4a] via-[#3b2f63] to-[#7a3b5f] text-white')}>
        {/* Status bar with the camera's island */}
        <div className="relative z-20 flex h-8 shrink-0 items-center justify-between px-6 text-[12px] font-semibold" dir="ltr">
          <span className="tabular-nums">{time}</span>
          <span className="absolute left-1/2 top-1.5 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1"><Wifi className="size-3.5" /><BatteryFull className="size-4" /></span>
        </div>
        {s.app === 'home' && <Home t={t} open={(app) => phone.set({ app })} web={(path) => phone.set({ app: 'web', web: path })} office={(w) => { onOffice(w); close(); }} />}
        {s.app === 'camera' && <CameraApp t={t} isPhone={isPhone} />}
        {s.app === 'gallery' && <GalleryApp t={t} />}
        {s.app === 'web' && s.web && <WebApp src={`/${locale}${s.web}?embed=1`} title={t(`app_${WEB_APPS.find((a) => a.path === s.web)?.id ?? 'chat'}`)} back={home} t={t} />}
        {/* Home bar: back to the home screen (and a close button beside it) */}
        <div className="relative z-20 flex h-7 shrink-0 items-center justify-center">
          <button type="button" onClick={home} aria-label={t('home')} className="h-6 w-36 touch-manipulation"><span className="mx-auto block h-1.5 w-28 rounded-full bg-white/80" /></button>
          <button type="button" onClick={close} aria-label={t('close')} className="absolute end-3 flex size-6 items-center justify-center rounded-full bg-white/15"><X className="size-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function Home({ t, open, web, office }: { t: T; open: (a: 'camera' | 'gallery') => void; web: (p: string) => void; office: (w: 'map' | 'arcade' | 'board') => void }) {
  const icon = (key: string, label: string, Icon: typeof Camera, color: string, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} className="flex flex-col items-center gap-1 text-[11px] font-medium transition active:scale-90">
      <span className={clsx('flex size-14 items-center justify-center rounded-[1.1rem] bg-gradient-to-br shadow-lg', color)}><Icon className="size-7" /></span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
      <div className="grid grid-cols-4 gap-x-2 gap-y-4 overflow-y-auto pb-2">
        {icon('camera', t('app_camera'), Camera, 'from-[#3a3a3c] to-[#1c1c1e]', () => open('camera'))}
        {icon('gallery', t('app_gallery'), Images, 'from-[#ff9f0a] via-[#ff375f] to-[#5e5ce6]', () => open('gallery'))}
        {WEB_APPS.map((a) => icon(a.id, t(`app_${a.id}`), a.icon, a.color, () => web(a.path)))}
        {icon('map', t('app_map'), MapIcon, 'from-[#30b0c7] to-[#1d7f91]', () => office('map'))}
        {icon('arcade', t('app_arcade'), Gamepad2, 'from-[#ff375f] to-[#b8233f]', () => office('arcade'))}
        {icon('board', t('app_board'), PenLine, 'from-[#2f9e6b] to-[#1f6e4a]', () => office('board'))}
      </div>
      {/* Dock */}
      <div className="mt-auto mb-2 flex justify-around rounded-[1.6rem] bg-white/15 px-3 py-2.5 backdrop-blur">
        {[['camera', Camera, 'from-[#3a3a3c] to-[#1c1c1e]', () => open('camera')], ['chat', MessageCircle, 'from-[#34c759] to-[#1f9d47]', () => web('/chat')], ['gallery', Images, 'from-[#ff9f0a] via-[#ff375f] to-[#5e5ce6]', () => open('gallery')]].map(([k, Icon, color, fn]) => (
          <button key={k as string} type="button" onClick={fn as () => void} aria-label={t(`app_${k as string}`)} className="transition active:scale-90">
            <span className={clsx('flex size-13 items-center justify-center rounded-[1.05rem] bg-gradient-to-br', color as string)}>{(() => { const I = Icon as typeof Camera; return <I className="size-7" />; })()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WebApp({ src, title, back, t }: { src: string; title: string; back: () => void; t: T }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg text-ink">
      <div className="flex h-10 shrink-0 items-center gap-1 bg-[#1c1c1e] px-2 text-white">
        <button type="button" onClick={back} aria-label={t('home')} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10"><ChevronLeft className="size-5 rtl:-scale-x-100" /></button>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        {!loaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted" /></div>}
        <iframe src={src} title={title} onLoad={() => setLoaded(true)} className="size-full border-0" />
      </div>
    </div>
  );
}

// ——— Camera ———
function CameraApp({ t, isPhone }: { t: T; isPhone: boolean }) {
  const s = usePhone();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { viewfinder.canvas = canvas.current; return () => { viewfinder.canvas = null; }; }, []);
  useEffect(() => { if (!note) return; const id = setTimeout(() => setNote(null), 2600); return () => clearTimeout(id); }, [note]);
  useEffect(() => { fetch('/api/photos').then((r) => r.json()).then((g: Gallery) => { if (g.photos?.[0]) setLast(g.photos[0].id); }).catch(() => {}); }, []);

  const shoot = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    for (let k = phone.get().timer; k > 0; k--) { setCount(k); await new Promise((r) => setTimeout(r, 1000)); }
    setCount(0);
    setFlash(true); setTimeout(() => setFlash(false), 160);
    const shot: Shot | null = await takePhoto();
    if (!shot) { setBusy(false); setNote({ text: t('failed'), bad: true }); return; }
    const form = new FormData();
    form.append('photo', new File([shot.blob], `photo.${shot.blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: shot.blob.type }));
    form.append('width', String(shot.width)); form.append('height', String(shot.height));
    try {
      const r = await fetch('/api/photos', { method: 'POST', body: form });
      const body = await r.json().catch(() => ({}));
      if (r.status === 409) setNote({ text: t('full'), bad: true });
      else if (!r.ok) setNote({ text: t('failed'), bad: true });
      else { setLast(body.photo.id); setNote({ text: t('saved', { kb: Math.round(shot.blob.size / 1024) }) }); }
    } catch { setNote({ text: t('failed'), bad: true }); } finally { setBusy(false); }
  }, [busy, t]);

  // Two fingers on the viewfinder zoom (rear lens 0.5×…5×; selfie: the stick gets longer or shorter).
  const fingers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ d0: number; z0: number } | null>(null);
  const onPointer = (e: React.PointerEvent, type: 'down' | 'move' | 'up') => {
    const f = fingers.current;
    if (type === 'down') f.set(e.pointerId, [e.clientX, e.clientY]);
    else if (type === 'up') { f.delete(e.pointerId); pinch.current = null; return; }
    else if (f.has(e.pointerId)) f.set(e.pointerId, [e.clientX, e.clientY]);
    if (f.size !== 2) return;
    const [a, b] = [...f.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const cur = phone.get();
    if (!pinch.current) { pinch.current = { d0: d, z0: cur.lens === 'rear' ? cur.zoom : cur.stick }; return; }
    const k = d / pinch.current.d0;
    if (cur.lens === 'rear') phone.set({ zoom: Math.round(Math.max(0.5, Math.min(5, pinch.current.z0 * k)) * 10) / 10 });
    else phone.set({ stick: Math.max(STICK[0], Math.min(STICK[1], pinch.current.z0 / k)) });
  };

  const chip = (on: boolean) => clsx('flex min-h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold transition active:scale-90', on ? 'bg-[#ffd60a] text-black' : 'bg-black/45 text-white');
  const zooms = ZOOMS[s.lens];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Viewfinder */}
      <div className="relative min-h-0 flex-1 touch-none overflow-hidden bg-black" onPointerDown={(e) => onPointer(e, 'down')} onPointerMove={(e) => onPointer(e, 'move')} onPointerUp={(e) => onPointer(e, 'up')} onPointerCancel={(e) => onPointer(e, 'up')}>
        <canvas ref={canvas} className={clsx('absolute inset-0 m-auto max-h-full max-w-full', s.aspect === 'tall' ? 'h-full w-auto' : 'h-auto w-full')} style={{ aspectRatio: s.aspect === 'tall' ? '3 / 4' : '16 / 9' }} />
        {s.grid && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/25" />)}</div>
        )}
        {count > 0 && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black drop-shadow-lg">{count}</div>}
        {flash && <div className="absolute inset-0 bg-white" />}
        {note && <div role="status" className={clsx('absolute inset-x-0 top-3 mx-auto w-max max-w-[90%] rounded-full px-3 py-1.5 text-center text-xs font-semibold', note.bad ? 'bg-[#ff453a]' : 'bg-black/70')}>{note.text}</div>}
        {/* Top tools */}
        <div className="absolute inset-x-2 top-2 flex justify-between">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => phone.set({ grid: !s.grid })} aria-pressed={s.grid} aria-label={t('grid')} title={t('grid')} className={chip(s.grid)}><Grid3x3 className="size-4" /></button>
            <button type="button" onClick={() => phone.set({ timer: s.timer === 0 ? 3 : s.timer === 3 ? 10 : 0 })} aria-label={t('timer')} title={t('timer')} className={chip(s.timer > 0)}>
              <Timer className="size-4" />{s.timer > 0 && <span className="ms-0.5">{s.timer}s</span>}
            </button>
          </div>
          <button type="button" onClick={() => phone.set({ aspect: s.aspect === 'tall' ? 'wide' : 'tall' })} aria-label={s.aspect === 'tall' ? t('wide') : t('tall')} title={s.aspect === 'tall' ? t('wide') : t('tall')} className={chip(s.aspect === 'wide')}>
            {s.aspect === 'tall' ? <RectangleVertical className="size-4" /> : <RectangleHorizontal className="size-4" />}<span className="ms-1">{s.aspect === 'tall' ? '3:4' : '16:9'}</span>
          </button>
        </div>
        {/* Zoom and selfie settings */}
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center gap-1.5">
          {s.lens === 'selfie' && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => phone.set({ angle: 'high' })} aria-pressed={s.angle === 'high'} className={chip(s.angle === 'high')}>{t('angleHigh')}</button>
              <button type="button" onClick={() => phone.set({ angle: 'level' })} aria-pressed={s.angle === 'level'} className={chip(s.angle === 'level')}>{t('angleLevel')}</button>
              <label className="flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px]">🤳
                <input type="range" min={STICK[0]} max={STICK[1]} step={0.05} value={s.stick} onChange={(e) => phone.set({ stick: Number(e.target.value) })} aria-label={t('stick')} className="w-16 accent-[#ffd60a]" />
              </label>
            </div>
          )}
          <div className="flex gap-1.5 rounded-full bg-black/35 p-1" dir="ltr">
            {zooms.map((z) => (
              <button key={z} type="button" onClick={() => phone.set({ zoom: z })} className={chip(Math.abs(s.zoom - z) < 0.05 || (z === zooms[zooms.length - 1] && s.zoom > z))}>{z < 1 ? `.${String(z).split('.')[1]}` : z}×</button>
            ))}
            {s.lens === 'rear' && !(zooms as readonly number[]).includes(s.zoom) && <span className={chip(true)}>{s.zoom}×</span>}
          </div>
        </div>
      </div>
      {/* Poses: one's character strikes it (everyone sees it for a few seconds) */}
      <div className="flex shrink-0 justify-center gap-1 overflow-x-auto bg-black px-2 py-1.5 [scrollbar-width:none]">
        {GESTURES.map((g) => (
          <button key={g.id} type="button" onClick={() => gestures.strike(g.id)} aria-label={t(`pose_${g.id}`)} title={t(`pose_${g.id}`)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl transition active:scale-90">{g.emoji}</button>
        ))}
      </div>
      {/* Shutter row */}
      <div className={clsx('flex shrink-0 items-center justify-between bg-black px-6', isPhone ? 'py-2' : 'py-3')}>
        <button type="button" onClick={() => phone.set({ app: 'gallery' })} aria-label={t('app_gallery')} className="size-12 overflow-hidden rounded-xl border-2 border-white/40 bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- private photo through our own route */}
          {last && <img src={`/api/photos/${last}`} alt="" className="size-full object-cover" />}
        </button>
        <button type="button" onClick={() => void shoot()} disabled={busy} aria-label={t('shutter')}
          className="flex size-[4.5rem] items-center justify-center rounded-full border-4 border-white transition active:scale-90 disabled:opacity-60">
          <span className="block size-14 rounded-full bg-white">{busy && <Loader2 className="m-auto mt-4 size-6 animate-spin text-black" />}</span>
        </button>
        <button type="button" onClick={() => phone.set({ lens: s.lens === 'rear' ? 'selfie' : 'rear', zoom: 1 })} aria-label={s.lens === 'rear' ? t('toSelfie') : t('toRear')} title={s.lens === 'rear' ? t('toSelfie') : t('toRear')}
          className="flex size-12 items-center justify-center rounded-full bg-white/15 transition active:scale-90"><SwitchCamera className="size-6" /></button>
      </div>
      <div className="flex shrink-0 justify-center gap-6 bg-black pb-1 text-[11px] font-bold tracking-wider">
        <button type="button" onClick={() => phone.set({ lens: 'rear', zoom: 1 })} className={s.lens === 'rear' ? 'text-[#ffd60a]' : 'text-white/60'}>{t('photo')}</button>
        <button type="button" onClick={() => phone.set({ lens: 'selfie', zoom: 1 })} className={s.lens === 'selfie' ? 'text-[#ffd60a]' : 'text-white/60'}>{t('selfie')}</button>
      </div>
    </div>
  );
}

// ——— Gallery ———
function GalleryApp({ t }: { t: T }) {
  const [g, setG] = useState<Gallery | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { fetch('/api/photos').then((r) => r.json()).then(setG).catch(() => setError(true)); }, []);
  useEffect(load, [load]);
  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    const r = await fetch(`/api/photos/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) { setView(null); load(); }
  };
  const share = Math.min(1, g ? g.used / g.quota : 0);
  const shown = view !== null && g ? g.photos[view] : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b0b0d]">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2">
        <h2 className="me-auto text-lg font-bold">{t('app_gallery')}</h2>
        {g && <span className="text-xs text-white/60" dir="ltr">{mb(g.used)} / {mb(g.quota)} MB</span>}
      </div>
      {g && (
        <div className="mx-4 mb-2 h-1.5 shrink-0 overflow-hidden rounded-full bg-white/10" aria-label={t('storage')}>
          <div className={clsx('h-full rounded-full', share > 0.9 ? 'bg-[#ff453a]' : 'bg-[#0a84ff]')} style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {!g && !error && <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-white/50" /></div>}
        {error && <p className="p-6 text-center text-sm text-white/60">{t('failed')}</p>}
        {g && g.photos.length === 0 && <p className="p-6 text-center text-sm text-white/60">{t('empty')}</p>}
        {g && (
          <div className="grid grid-cols-3 gap-0.5">
            {g.photos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => setView(i)} className="aspect-square overflow-hidden bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element -- private photo through our own route */}
                <img src={`/api/photos/${p.id}`} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      {shown && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black">
          <div className="flex shrink-0 items-center justify-between px-2 pt-8">
            <button type="button" onClick={() => setView(null)} aria-label={t('back')} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10"><ChevronLeft className="size-6 rtl:-scale-x-100" /></button>
            <span className="text-xs text-white/60" dir="ltr">{new Date(shown.createdAt).toLocaleString()} · {Math.round(shown.size / 1024)} KB</span>
            <span className="size-10" />
          </div>
          <div className="relative min-h-0 flex-1" onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const next = e.clientX > r.left + r.width / 2 ? 1 : -1; setView((v) => (v === null ? v : Math.max(0, Math.min(g!.photos.length - 1, v + next)))); }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private photo through our own route */}
            <img src={`/api/photos/${shown.id}`} alt="" className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
          </div>
          <div className="flex shrink-0 justify-around py-3">
            <a href={`/api/photos/${shown.id}`} download={`photo-${shown.id.slice(0, 8)}.webp`} aria-label={t('download')} className="flex size-11 items-center justify-center rounded-full bg-white/10"><Download className="size-5" /></a>
            <button type="button" onClick={() => void remove(shown.id)} aria-label={t('delete')} className="flex size-11 items-center justify-center rounded-full bg-white/10 text-[#ff453a]"><Trash2 className="size-5" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
