'use client';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Mic, MonitorSmartphone, Monitor, Smartphone, VolumeX, Volume2 } from 'lucide-react';
import { useVoice, type MicDevice } from './VoiceContext';

function MicButton({ device }: { device: MicDevice }) {
  const t = useTranslations('voice');
  const v = useVoice();
  const active = v.activeDevice === device && v.micOn;
  const here = v.thisDevice === device;
  const Icon = device === 'phone' ? Smartphone : Monitor;
  return (
    <button type="button" disabled={!here}
      onClick={() => (v.activeDevice === device ? v.toggleMic() : v.useMicHere())}
      className="flex touch-manipulation flex-col items-center gap-1.5 disabled:cursor-not-allowed"
      title={here ? t('activeHere') : t('activeOther')}>
      <span className={clsx('flex size-14 items-center justify-center rounded-full border-2 transition-all',
        active ? (device === 'phone' ? 'border-[#3ee07a] text-[#3ee07a] shadow-[0_0_16px_#3ee07a]' : 'border-[#38bdf8] text-[#38bdf8] shadow-[0_0_16px_#38bdf8]')
          : 'border-white/20 text-white/50')}>
        {active ? <Mic className="size-6" /> : <Icon className="size-6" />}
      </span>
      <span className="text-[11px] text-white/80">{device === 'phone' ? t('micPhone') : t('micComputer')}</span>
    </button>
  );
}

// Steam Deck style panel: one active microphone across the user's phone and computer.
export function VoicePanel() {
  const t = useTranslations('voice');
  const v = useVoice();
  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#2b2f33] to-[#1c1f22] p-3 shadow-inner ring-1 ring-black/40">
      <div className="flex justify-around"><MicButton device="phone" /><MicButton device="computer" /></div>
      <button type="button" onClick={v.toggleMuteAll}
        className={clsx('mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl text-xs ring-1 ring-white/10',
          v.allMuted ? 'bg-danger/80 text-white' : 'bg-black/30 text-white/80 hover:bg-black/40')}>
        {v.allMuted ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        {v.allMuted ? t('unmuteAll') : t('muteAll')}
      </button>
      {v.error && <p className="mt-2 text-center text-[11px] text-[#ffb4a8]">{t('noPermission')}</p>}
      {v.peerCount > 0 && <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-white/60"><MonitorSmartphone className="size-3" />{t('peers', { n: v.peerCount })}</p>}
    </div>
  );
}
