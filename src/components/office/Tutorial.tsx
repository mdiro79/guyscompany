'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setTutorialDoneAction } from '@/app/actions/profile';

const STEPS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;

// Guided tour by the receptionist; shown on first visit (replayable from the user panel).
export function Tutorial({ onDone }: { onDone: () => void }) {
  const t = useTranslations('tutorial');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [, start] = useTransition();
  const finish = () => start(async () => { await setTutorialDoneAction(true); onDone(); router.refresh(); });
  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-28 z-30 mx-auto max-w-md rounded-2xl bg-white/95 p-4 text-[#1f2a24] shadow-xl sm:bottom-10">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/models/thumbs/kaykit-ranger.webp" alt="" className="size-9 rounded-full bg-[#f6e3cf]" />
        {t('title')}
        <span className="ms-auto text-xs text-[#6f7a73]">{step + 1}/{STEPS.length}</span>
      </div>
      <p className="text-sm leading-6" dir="auto">{t(STEPS[step])}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn min-h-10 text-[#6f7a73]" onClick={finish}>{t('skip')}</button>
        <button type="button" className="btn ms-auto min-h-10 bg-[#2f5d45] text-white"
          onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>{step === STEPS.length - 1 ? t('done') : t('next')}</button>
      </div>
    </div>
  );
}
