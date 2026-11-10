'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { MapPin, Navigation, Smartphone, X } from 'lucide-react';
import type { Mesh, LinkInfo } from '@/lib/realtime/mesh';
import type { Office, Profile } from '@/lib/data/types';
import { memberColor } from '@/lib/board/draw';
import { OFFICES, H, OUT, SOUTH, CONF_RADIUS, GARDEN, areaAt, officeAt, places, type Area, type Place } from './layout';
import type { RemoteAvatar } from './useOfficeNet';

// The office map: where everyone is, how good each person's link is, and a tap on a room (or on "go to"
// next to a person) to walk there at once. Useful everywhere, essential on phones.

const FRESH_MS = 5000;
const ROOM_FILL: Record<string, string> = { cafe: '#e9c79c', library: '#b9cdb0', game: '#4a4c86', garden: '#9fd08a', reception: '#eadfcd', conference: '#f2b6ae' };

export function MiniMap({ profiles, offices, meId, myPos, remotes, mesh, onGo, onClose }: {
  profiles: Profile[]; offices: Office[]; meId: string; myPos: [number, number]; remotes: React.RefObject<Map<string, RemoteAvatar>>;
  mesh: Mesh | null; onGo: (p: { x: number; z: number; yaw: number }) => void; onClose: () => void;
}) {
  const t = useTranslations('office');
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.code === 'Escape' || e.code === 'KeyN') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const now = performance.now();
  const here = [...(remotes.current?.values() ?? [])].filter((r) => now - r.receivedAt < FRESH_MS && profiles.some((p) => p.id === r.userId));
  const links = new Map<string, LinkInfo>();
  for (const l of mesh?.links() ?? []) { const cur = links.get(l.userId); if (!cur || (l.state === 'connected' && cur.state !== 'connected')) links.set(l.userId, l); }
  const all = places();
  const officeName = (slot: number) => {
    const owner = profiles.find((p) => p.id === offices.find((o) => o.slot === slot)?.ownerId);
    return owner ? owner.displayName : t('officeN', { slot });
  };
  const placeName = (x: number, z: number) => { const o = officeAt(x, z); return o ? t('officeOf', { name: officeName(o.slot) }) : t(areaAt(x, z)); };
  const go = (p: Place | undefined) => { if (p) { onGo({ x: p.pos[0], z: p.pos[1], yaw: p.yaw }); onClose(); } };
  // Next to a person; someone inside an office is met at its door (the office's own rules decide who gets in).
  const goTo = (r: RemoteAvatar) => {
    const o = officeAt(r.pose.x, r.pose.z);
    if (o) return go(all.find((p) => p.id === `office-${o.slot}`));
    onGo({ x: r.pose.x + Math.sin(r.pose.yaw) * -0.9, z: r.pose.z + Math.cos(r.pose.yaw) * -0.9, yaw: r.pose.yaw + Math.PI });
    onClose();
  };
  const room = (id: Area, x: number, z: number, w: number, d: number, label: string, dark = false) => (
    <g key={id} role="button" tabIndex={0} aria-label={label} onClick={() => go(all.find((p) => p.id === id))} onKeyDown={(e) => { if (e.key === 'Enter') go(all.find((p) => p.id === id)); }} className="cursor-pointer outline-none [&:hover>rect]:opacity-80 [&:focus-visible>rect]:stroke-white">
      <rect x={x} y={z} width={w} height={d} rx={0.5} fill={ROOM_FILL[id]} stroke="#3a3330" strokeWidth={0.18} />
      <text x={x + w / 2} y={z + d / 2} textAnchor="middle" dominantBaseline="middle" fontSize={1.25} fontWeight={700} fill={dark ? '#ffffff' : '#2a221c'} style={{ pointerEvents: 'none' }}>{label}</text>
    </g>
  );
  const me = profiles.find((p) => p.id === meId);
  const ids = profiles.map((p) => p.id);
  const colorOf = (id: string) => memberColor(ids, id);
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/45 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center" onClick={onClose}>
      <div className="flex max-h-full w-[min(34rem,100%)] flex-col gap-2 overflow-y-auto rounded-3xl bg-[#231c17]/95 p-3 shadow-2xl backdrop-blur short:w-[min(52rem,100%)] short:flex-row" role="dialog" aria-label={t('map.title')} onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <MapPin className="size-5 text-[#ffd98a]" /><h2 className="me-auto font-bold">{t('map.title')}</h2>
            <button type="button" onClick={onClose} aria-label={t('map.close')} className="flex size-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 short:hidden"><X className="size-5" /></button>
          </div>
          <p className="mb-2 text-xs text-white/65">{t('map.hint')}</p>
          <svg viewBox={`${GARDEN.min[0] - 0.6} ${-OUT - 0.6} ${OUT - GARDEN.min[0] + 1.2} ${OUT + SOUTH + 1.2}`} className="w-full touch-manipulation select-none short:max-h-[calc(100dvh-7rem)]" direction="ltr">
            {room('garden', GARDEN.min[0], -H, GARDEN.max[0] - GARDEN.min[0], 2 * H, `🌳 ${t('garden')}`)}
            {room('cafe', -OUT, -H, OUT - H, 2 * H, `☕ ${t('cafe')}`)}
            {room('library', H, -H, OUT - H, 2 * H, `📚 ${t('library')}`)}
            {room('game', -H, -OUT, 2 * H, OUT - H, `🎮 ${t('game')}`, true)}
            {room('reception', -H, H, 2 * H, SOUTH - H, `🛎 ${t('reception')}`)}
            <rect x={-H} y={-H} width={2 * H} height={2 * H} fill="#eadfcd" stroke="#3a3330" strokeWidth={0.18} />
            <g role="button" tabIndex={0} aria-label={t('conference')} onClick={() => go(all.find((p) => p.id === 'conference'))} className="cursor-pointer outline-none [&:hover>circle]:opacity-80">
              <circle r={CONF_RADIUS} fill={ROOM_FILL.conference} stroke="#3a3330" strokeWidth={0.18} />
              <text textAnchor="middle" dominantBaseline="middle" fontSize={1.1} fontWeight={700} fill="#2a221c" style={{ pointerEvents: 'none' }}>{t('conference')}</text>
            </g>
            {OFFICES.map((o) => {
              const label = officeName(o.slot);
              return (
                <g key={o.slot} role="button" tabIndex={0} aria-label={label} onClick={() => go(all.find((p) => p.id === `office-${o.slot}`))} className="cursor-pointer outline-none [&:hover>rect]:opacity-80">
                  <rect x={o.min[0]} y={o.min[1]} width={o.max[0] - o.min[0]} height={o.max[1] - o.min[1]} rx={0.5} fill={o.wallColor === 'orange' ? '#e8743b' : '#2f8f8a'} stroke="#3a3330" strokeWidth={0.18} />
                  <text x={(o.min[0] + o.max[0]) / 2} y={(o.min[1] + o.max[1]) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={1.2} fontWeight={700} fill="#ffffff" style={{ pointerEvents: 'none' }}>{label}</text>
                </g>
              );
            })}
            {here.map((r) => (
              <g key={r.userId} transform={`translate(${r.pose.x} ${r.pose.z})`} style={{ pointerEvents: 'none' }}>
                <circle r={0.85} fill={colorOf(r.userId)} stroke="#ffffff" strokeWidth={0.2} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={0.95} fontWeight={800} fill="#ffffff">{(profiles.find((p) => p.id === r.userId)?.displayName ?? '?').slice(0, 1)}</text>
              </g>
            ))}
            <g transform={`translate(${myPos[0]} ${myPos[1]})`} style={{ pointerEvents: 'none' }}>
              <circle r={1.25} fill="none" stroke="#ffffff" strokeWidth={0.16} opacity={0.7} className="gc-map-pulse" />
              <circle r={0.8} fill="#ffd23f" stroke="#2a221c" strokeWidth={0.2} />
            </g>
          </svg>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 short:w-64">
          <div className="hidden justify-end short:flex"><button type="button" onClick={onClose} aria-label={t('map.close')} className="flex size-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><X className="size-5" /></button></div>
          <h3 className="text-xs font-bold text-white/70">{t('here', { n: here.length + 1 })}</h3>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/models/thumbs/${me?.characterId ?? 'kaykit-mage'}.webp`} alt="" className="size-9 shrink-0 rounded-full bg-[#f6e3cf] object-cover ring-2 ring-[#ffd23f]" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{me?.displayName} · {t('you')}</span><span className="block truncate text-xs text-white/60">{placeName(myPos[0], myPos[1])}</span></span>
          </div>
          {here.map((r) => {
            const p = profiles.find((x) => x.id === r.userId)!;
            const link = links.get(r.userId);
            const state = link?.state ?? 'connected';
            return (
              <div key={r.userId} className="flex items-center gap-2 rounded-xl bg-white/5 p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/models/thumbs/${p.characterId}.webp`} alt="" className="size-9 shrink-0 rounded-full bg-[#f6e3cf] object-cover" style={{ boxShadow: `0 0 0 2px ${colorOf(r.userId)}` }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-semibold"><span className="truncate">{p.displayName}</span>{link?.device === 'phone' && <Smartphone className="size-3 shrink-0 text-white/60" />}</span>
                  <span className="flex items-center gap-1 text-xs text-white/60">
                    <span className={clsx('size-2 shrink-0 rounded-full', state === 'connected' ? (link && link.rtt > 250 ? 'bg-[#f6c544]' : 'bg-[#22a559]') : state === 'connecting' ? 'animate-pulse bg-[#f6c544]' : 'bg-[#d9443c]')} title={t(`link.${state}`)} />
                    <span className="truncate">{placeName(r.pose.x, r.pose.z)}{link && link.rtt >= 0 && state === 'connected' ? ` · ${link.rtt}ms` : state !== 'connected' ? ` · ${t(`link.${state}`)}` : ''}</span>
                  </span>
                </span>
                <button type="button" onClick={() => goTo(r)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-[#2f5d45] px-3 text-xs font-semibold active:scale-95"><Navigation className="size-3.5" />{t('map.goTo')}</button>
              </div>
            );
          })}
          {here.length === 0 && <p className="rounded-xl bg-white/5 p-3 text-center text-xs text-white/60">{t('map.alone')}</p>}
        </div>
      </div>
    </div>
  );
}
