'use client';
import { useEffect, useState, useTransition } from 'react';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { Lock, Unlock, Eye, EyeOff, Target, Globe, Users, MessageSquare, X } from 'lucide-react';
import type { Office, OfficeVisit, Profile, Message, FileMeta } from '@/lib/data/types';
import { updateMyOfficeAction, listVisitsAction, inviteToChatAction } from '@/app/actions/offices';
import { formatDate, formatTime } from '@/lib/format';
import { ChatPanel } from '@/components/chat/ChatPanel';

// Owner controls shown while standing in one's own office.
export function OfficePanel({ office, profiles, me, privateMessages, files }: {
  office: Office; profiles: Profile[]; me: Profile; privateMessages: Message[]; files: FileMeta[];
}) {
  const t = useTranslations('office');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [, start] = useTransition();
  const [visits, setVisits] = useState<OfficeVisit[]>([]);
  const [tab, setTab] = useState<'settings' | 'visitors' | 'chat' | null>('settings');
  const [invitee, setInvitee] = useState('');
  const set = (patch: Partial<Office>) => start(async () => { await updateMyOfficeAction(patch); });
  useEffect(() => { if (tab === 'visitors') listVisitsAction(office.slot).then(setVisits); }, [tab, office.slot]);
  const name = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  const Toggle = ({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Lock; label: string }) => (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={clsx('flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm', on ? 'bg-brand text-brand-ink' : 'bg-white/10 text-white hover:bg-white/20')}>
      <Icon className="size-4" />{label}
    </button>
  );
  return (
    <div className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl bg-black/70 p-3 text-white backdrop-blur">
      <div className="mb-2 flex items-center gap-1">
        <span className="me-auto text-sm font-semibold">{t('myOffice')}</span>
        {(['settings', 'visitors', 'chat'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(tab === k ? null : k)}
            className={clsx('flex size-9 items-center justify-center rounded-lg', tab === k ? 'bg-white/25' : 'hover:bg-white/10')} aria-label={k}>
            {k === 'settings' ? <Target className="size-4" /> : k === 'visitors' ? <Users className="size-4" /> : <MessageSquare className="size-4" />}
          </button>
        ))}
        {tab && <button type="button" className="flex size-9 items-center justify-center rounded-lg hover:bg-white/10" onClick={() => setTab(null)} aria-label={tc('close')}><X className="size-4" /></button>}
      </div>
      {tab === 'settings' && (
        <div className="grid grid-cols-2 gap-2">
          <Toggle on={office.glass === 'frosted'} onClick={() => set({ glass: office.glass === 'frosted' ? 'clear' : 'frosted' })} icon={office.glass === 'frosted' ? EyeOff : Eye} label={`${t('glass')}: ${office.glass === 'frosted' ? t('frosted') : t('clear')}`} />
          <Toggle on={office.locked} onClick={() => set({ locked: !office.locked })} icon={office.locked ? Lock : Unlock} label={office.locked ? t('unlock') : t('lock')} />
          <Toggle on={office.focus} onClick={() => set({ focus: !office.focus })} icon={Target} label={t('focusMode')} />
          <Toggle on={office.isPublic} onClick={() => set({ isPublic: !office.isPublic })} icon={Globe} label={office.isPublic ? t('public') : t('private')} />
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
          <div className="h-72 overflow-hidden rounded-xl bg-surface text-ink">
            <ChatPanel channel={`office:${office.slot}`} messages={privateMessages} files={files} title={t('privateChat')} className="h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
