'use client';
import { useEffect, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Lock, Unlock, Eye, EyeOff, Target, Globe, Users, MessageSquare, X } from 'lucide-react';
import type { Office, OfficeVisit, Profile, Message, FileMeta } from '@/lib/data/types';
import { listVisitsAction, inviteToChatAction } from '@/app/actions/offices';
import type { ActionResult } from '@/app/actions/result';
import { formatDate, formatTime } from '@/lib/format';
import { ChatPanel } from '@/components/chat/ChatPanel';

export type OfficeSettings = Partial<Pick<Office, 'glass' | 'locked' | 'focus' | 'isPublic'>>;

// Declared outside the panel: a component created during render is a new type each time, so every
// re-render (the office re-renders while walking) replaced the buttons and could swallow a tap or click.
function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Lock; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={clsx('flex min-h-11 touch-manipulation items-center gap-2 rounded-xl px-3 text-start text-sm transition-colors active:scale-[0.98]',
        on ? 'bg-brand text-brand-ink' : 'bg-white/10 text-white hover:bg-white/20')}>
      <Icon className="size-4 shrink-0" />{label}
    </button>
  );
}

// Owner controls shown while standing in one's own office. `onChange` applies a change at once
// (glass, door and panel) and saves it; the change is undone if saving fails.
export type OfficeTab = 'settings' | 'visitors' | 'chat';

// The open panel; closed, it is the small "my office" pill in the office top bar (OfficeView).
export function OfficePanel({ office, profiles, me, privateMessages, files, onChange, tab, onTab }: {
  office: Office; profiles: Profile[]; me: Profile; privateMessages: Message[]; files: FileMeta[];
  onChange: (patch: OfficeSettings) => Promise<ActionResult>; tab: OfficeTab; onTab: (tab: OfficeTab | null) => void;
}) {
  const t = useTranslations('office');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [, start] = useTransition();
  const [visits, setVisits] = useState<OfficeVisit[]>([]);
  const [invitee, setInvitee] = useState('');
  const [failed, setFailed] = useState(false);
  const set = (patch: OfficeSettings) => {
    setFailed(false);
    start(async () => {
      const r = await onChange(patch).catch(() => null);
      if (!r?.ok) setFailed(true);
    });
  };
  useEffect(() => { if (tab === 'visitors') listVisitsAction(office.slot).then(setVisits); }, [tab, office.slot]);
  const name = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  return (
    <div className="pointer-events-auto max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-1.5rem))] shadow-xl overflow-y-auto rounded-2xl bg-black/70 p-3 text-white backdrop-blur short:max-h-[calc(100dvh-4.5rem)]">
      <div className="mb-2 flex items-center gap-1">
        <span className="me-auto text-sm font-semibold">{t('myOffice')}</span>
        {(['settings', 'visitors', 'chat'] as const).map((k) => (
          <button key={k} type="button" onClick={() => onTab(k)}
            className={clsx('flex size-11 touch-manipulation items-center justify-center rounded-lg', tab === k ? 'bg-white/25' : 'hover:bg-white/10')} aria-label={k} aria-pressed={tab === k}>
            {k === 'settings' ? <Target className="size-4" /> : k === 'visitors' ? <Users className="size-4" /> : <MessageSquare className="size-4" />}
          </button>
        ))}
        <button type="button" className="flex size-11 touch-manipulation items-center justify-center rounded-lg hover:bg-white/10" onClick={() => onTab(null)} aria-label={tc('close')}><X className="size-4" /></button>
      </div>
      {tab === 'settings' && (
        <div className="grid grid-cols-2 gap-2">
          <Toggle on={office.glass === 'frosted'} onClick={() => set({ glass: office.glass === 'frosted' ? 'clear' : 'frosted' })} icon={office.glass === 'frosted' ? EyeOff : Eye} label={`${t('glass')}: ${office.glass === 'frosted' ? t('frosted') : t('clear')}`} />
          <Toggle on={office.locked} onClick={() => set({ locked: !office.locked })} icon={office.locked ? Lock : Unlock} label={office.locked ? t('unlock') : t('lock')} />
          <Toggle on={office.focus} onClick={() => set({ focus: !office.focus })} icon={Target} label={t('focusMode')} />
          <Toggle on={office.isPublic} onClick={() => set({ isPublic: !office.isPublic })} icon={Globe} label={office.isPublic ? t('public') : t('private')} />
          {failed && <p className="col-span-2 text-xs text-[#ffb4a8]" role="alert">{t('saveFailed')}</p>}
        </div>
      )}
      {tab === 'visitors' && (
        <div>
          <div className="mb-1 text-xs text-white/70">{t('visitors')}</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {visits.length === 0 && <li className="text-white/60">{t('noVisitors')}</li>}
            {visits.map((v) => <li key={v.id} className="flex justify-between gap-2 rounded-lg bg-white/10 px-2 py-1"><span>{name(v.visitorId)}</span><span className="text-xs text-white/60" dir="ltr">{formatDate(locale, v.visitedAt)} {formatTime(locale, v.visitedAt)}</span></li>)}
          </ul>
        </div>
      )}
      {tab === 'chat' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select className="input min-h-10 text-ink" value={invitee} onChange={(e) => setInvitee(e.target.value)}>
              <option value="">{t('invite')}…</option>
              {profiles.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
            <button type="button" className="btn-primary min-h-10" disabled={!invitee} onClick={() => start(async () => { await inviteToChatAction(invitee); setInvitee(''); })}>{tc('send')}</button>
          </div>
          <div className="h-72 overflow-hidden rounded-xl bg-surface text-ink short:h-52">
            <ChatPanel channel={`office:${office.slot}`} messages={privateMessages} files={files} title={t('privateChat')} className="h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
