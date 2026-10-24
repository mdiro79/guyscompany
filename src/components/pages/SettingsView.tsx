'use client';
import { useActionState, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Check, Keyboard, GraduationCap } from 'lucide-react';
import { useShell } from '@/components/shell/ShellContext';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { SaveButton, useResultStatus, useSave } from '@/components/ui/SaveButton';
import { updateProfileAction, setCharacterAction, requestSwapAction, respondSwapAction, setTutorialDoneAction } from '@/app/actions/profile';
import { setStatusAction } from '@/app/actions/misc';
import { respondInviteAction } from '@/app/actions/offices';
import { CHARACTERS, prettyName } from '@/lib/characters';
import { formatNumber } from '@/lib/format';
import type { ChatInvite, SwapRequest, UserStatus } from '@/lib/data/types';

const CharacterPreview = dynamic(() => import('@/components/three/CharacterPreview'), { ssr: false, loading: () => <div className="size-full animate-pulse rounded-2xl bg-surface-2" /> });

export function SettingsView({ swaps, invites }: { swaps: SwapRequest[]; invites: ChatInvite[] }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const tAll = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user, profiles, offices, patchUser } = useShell();
  const [selected, setSelected] = useState(user.characterId);
  const [swapTo, setSwapTo] = useState('');
  const [note, setNote] = useState('');
  const [, start] = useTransition();
  const [state, action, pending] = useActionState(updateProfileAction, null);
  const profileStatus = useResultStatus(state);
  const character = useSave();
  const swap = useSave();
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); });
  // Character and status show at once everywhere (avatar, office) and roll back if the save fails.
  const saveCharacter = () => {
    const before = user.characterId;
    patchUser?.({ characterId: selected });
    character.run(() => setCharacterAction(selected), () => patchUser?.({ characterId: before }));
  };
  const setStatus = (s: UserStatus) => {
    const before = user.status;
    patchUser?.({ status: s });
    start(async () => { const r = await setStatusAction(s).catch(() => null); if (!r?.ok) patchUser?.({ status: before }); });
  };
  const myOffice = offices.find((o) => o.ownerId === user.id);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  const incoming = swaps.filter((s) => s.toUserId === user.id && s.status === 'pending');
  const incomingInvites = invites.filter((i) => i.inviteeId === user.id && i.status === 'pending');
  const shortcuts: [string, string][] = [['W A S D', 'settings.keyMove'], ['E', 'office.sit'], ['Q', 'office.emotes'], ['M', 'voice.micComputer'], ['F', 'office.fullscreen'], ['⌘/Ctrl K', 'common.search']];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="card p-4 xl:col-span-2">
        <h2 className="mb-1 font-semibold">{t('character')}</h2>
        <p className="mb-3 text-sm text-muted">{t('chooseCharacter')}</p>
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <div className="h-72 overflow-hidden rounded-2xl bg-gradient-to-b from-accent-soft to-teal-soft md:h-auto md:min-h-72"><CharacterPreview characterId={selected} /></div>
          <div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-10 xl:grid-cols-5 2xl:grid-cols-10">
              {CHARACTERS.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelected(c.id)} title={prettyName(c)}
                  className={clsx('relative aspect-square overflow-hidden rounded-xl bg-surface-2 ring-2 transition', selected === c.id ? 'ring-brand' : 'ring-transparent hover:ring-line')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/models/thumbs/${c.id}.webp`} alt={prettyName(c)} className="size-full object-cover" loading="lazy" />
                  {user.characterId === c.id && <span className="absolute top-1 end-1 flex size-5 items-center justify-center rounded-full bg-brand text-brand-ink"><Check className="size-3" /></span>}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-medium" dir="ltr">{prettyName(CHARACTERS.find((c) => c.id === selected)!)}</span>
              <SaveButton type="button" className="btn-primary ms-auto min-h-10" pending={character.pending} status={character.status}
                disabled={selected === user.characterId && character.status === 'idle'} onClick={saveCharacter}>
                {selected === user.characterId ? <><Check className="size-4" />{t('selected')}</> : tc('save')}
              </SaveButton>
            </div>
          </div>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t('profile')}</h2>
        <form action={action} className="space-y-3">
          <div><label className="label">{t('displayName')}</label><input name="displayName" defaultValue={user.displayName} required maxLength={40} className="input" dir="auto" /></div>
          <div><label className="label">{t('jobTitle')}</label><input name="jobTitle" defaultValue={user.jobTitle} maxLength={40} className="input" dir="auto" /></div>
          <div className="flex justify-end"><SaveButton pending={pending} status={profileStatus}>{tc('save')}</SaveButton></div>
        </form>
        <div>
          <div className="label">{t('status')}</div>
          <div className="flex gap-2">
            {(['online', 'busy', 'focus'] as UserStatus[]).map((s) => (
              <button key={s} type="button" aria-pressed={user.status === s} onClick={() => setStatus(s)}
                className={clsx('btn min-h-10 flex-1 border transition-all active:scale-95', user.status === s ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line')}>{tAll(`status.${s}`)}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <ChangePasswordForm forced={false} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">{t('currentOffice')}</h2>
        <p className="text-sm">{myOffice ? tAll('team.office', { slot: formatNumber(locale, myOffice.slot) }) : tAll('team.noOffice')}</p>
        <div className="flex gap-2">
          <select className="input" value={swapTo} onChange={(e) => setSwapTo(e.target.value)}>
            <option value="">{t('swapWith')}…</option>
            {profiles.filter((p) => p.id !== user.id).map((p) => {
              const o = offices.find((x) => x.ownerId === p.id);
              return <option key={p.id} value={p.id}>{p.displayName}{o ? ` (${formatNumber(locale, o.slot)})` : ''}</option>;
            })}
          </select>
          <SaveButton type="button" className="btn-primary shrink-0" pending={swap.pending} status={swap.status === 'error' ? 'error' : 'idle'} disabled={!swapTo}
            onClick={() => swap.run(async () => { const r = await requestSwapAction(swapTo); if (r.ok) setNote(t('requestSent')); return r; })}>{tc('send')}</SaveButton>
        </div>
        {note && <p className="text-sm text-brand">{note}</p>}
        {incoming.length > 0 && <div>
          <div className="label">{t('swapRequests')}</div>
          <ul className="space-y-2">{incoming.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
              <span className="flex-1">{tAll('notify.swap_request', { name: nameOf(s.fromUserId) })}</span>
              <button type="button" className="btn-primary min-h-9" onClick={() => run(() => respondSwapAction(s.id, true))}>{tc('accept')}</button>
              <button type="button" className="btn-ghost min-h-9" onClick={() => run(() => respondSwapAction(s.id, false))}>{tc('decline')}</button>
            </li>))}</ul>
        </div>}
        {incomingInvites.length > 0 && <div>
          <div className="label">{t('invites')}</div>
          <ul className="space-y-2">{incomingInvites.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
              <span className="flex-1">{tAll('notify.chat_invite', { name: nameOf(i.inviterId) })}</span>
              <button type="button" className="btn-primary min-h-9" onClick={() => run(() => respondInviteAction(i.id, true))}>{tc('accept')}</button>
              <button type="button" className="btn-ghost min-h-9" onClick={() => run(() => respondInviteAction(i.id, false))}>{tc('decline')}</button>
            </li>))}</ul>
        </div>}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Keyboard className="size-5" />{t('keys')}</h2>
        <ul className="space-y-1.5 text-sm">
          {shortcuts.map(([k, label]) => (
            <li key={k} className="flex items-center gap-3"><kbd className="min-w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-center text-xs" dir="ltr">{k}</kbd><span className="text-muted">{tAll(label)}</span></li>
          ))}
        </ul>
        <button type="button" className="btn-ghost" onClick={() => run(async () => { await setTutorialDoneAction(false); router.push(`/${locale}/office`); })}><GraduationCap className="size-4" />{t('replayTutorial')}</button>
      </section>
    </div>
  );
}
