'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useShell } from '@/components/shell/ShellContext';
import { officeUi } from '../../store';
import { arcadeNet, useArcadeNet } from './net';
import { arcadeScores, type News } from './scores';
import { arcadeView, useArcadeView } from './view';
import { gameDef } from './registry';

// Shown on every page: a teammate's invitation to a game (join opens the arcade right at that table) and
// a short line when someone sets a record or wins a match. Inside the arcade the list itself shows them.
export function ArcadeInvites() {
  const t = useTranslations('office');
  const { profiles } = useShell();
  const router = useRouter();
  const pathname = usePathname();
  useArcadeNet();
  const view = useArcadeView();
  const inOffice = pathname.startsWith('/office'), inArcade = pathname.startsWith('/arcade');
  const [arcadeOpen, setArcadeOpen] = useState(false);
  useEffect(() => officeUi.subscribe(() => setArcadeOpen(officeUi.get().overlay === 'arcade')), []);
  const [news, setNews] = useState<News | null>(null);
  useEffect(() => arcadeScores.onNews(setNews), []);
  useEffect(() => { if (!news) return; const id = setTimeout(() => setNews(null), 6000); return () => clearTimeout(id); }, [news]);
  const name = (id: string) => profiles.find((p) => p.id === id)?.displayName ?? '—';
  const showing = inArcade || (inOffice && arcadeOpen);
  const invite = showing && !view.game ? undefined : arcadeNet.invites()[0];
  const join = (id: string, game: string) => {
    const def = gameDef(game);
    if (!def) return;
    arcadeNet.join(id);
    arcadeView.set({ game: def.id });
    if (inOffice) { if (document.pointerLockElement) document.exitPointerLock(); officeUi.set({ overlay: 'arcade', emoteWheel: false }); }
    else if (!inArcade) router.push('/arcade');
  };
  if (!invite && !news) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(5rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3 short:bottom-3">
      {news && !showing && (
        <p className="gc-pop rounded-full bg-[#14173a]/95 px-4 py-2 text-xs font-semibold text-white shadow-xl ring-1 ring-[#ffd23f]/50">
          {gameDef(news.game)?.icon} {news.kind === 'record' ? t('hub.newRecord', { name: name(news.userId), game: t(`games.${news.game}.name`), score: news.best }) : t('hub.newWin', { name: name(news.userId), game: t(`games.${news.game}.name`) })}
        </p>
      )}
      {invite && (
        <div className="gc-pop pointer-events-auto flex w-[min(26rem,100%)] items-center gap-2 rounded-2xl bg-[#14173a]/95 p-2.5 text-white shadow-2xl ring-1 ring-[#ffd23f]/60">
          <span className="text-2xl">{gameDef(invite.game)?.icon}</span>
          <p className="min-w-0 flex-1 text-sm leading-5">{t('hub.invite', { name: name(invite.host), game: t(`games.${invite.game}.name`) })}</p>
          <button type="button" onClick={() => join(invite.id, invite.game)} className="min-h-11 shrink-0 rounded-xl bg-[#ffd23f] px-4 text-sm font-extrabold text-[#14173a] active:scale-95">{t('hub.join')}</button>
          <button type="button" onClick={() => arcadeNet.dismiss(invite.id)} aria-label={t('hub.ignore')} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20">✕</button>
        </div>
      )}
    </div>
  );
}
