'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setTutorialDoneAction } from '@/app/actions/profile';
import { tour, useTourStep, stepArrived } from './tour';
import { RECEPTIONIST_CHARACTER } from './Receptionist';

// Speech panel of the receptionist's guided tour (first visit, or press E next to her to replay).
export function Tutorial({ markDone }: { markDone: boolean }) {
  const t = useTranslations('tutorial');
  const router = useRouter();
  const step = useTourStep();
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    if (step === null) return;
    setArrived(false);
    const id = setInterval(() => setArrived(stepArrived()), 200);
    return () => clearInterval(id);
  }, [step]);

  const finish = () => {
    tour.stop();
    if (markDone) void setTutorialDoneAction(true).then(() => router.refresh());
  };
  const next = () => {
    if (!arrived) return;
    if (step === tour.get().steps.length - 1) finish(); else tour.next();
  };

  useEffect(() => {
    if (step === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (step === null) return null;
  const steps = tour.get().steps;
  const key = steps[step].key;
  const last = step === steps.length - 1;
  return (
    // Speech bubble above the receptionist's head (positioned by TourBubbleAnchor inside the 3D scene).
    <div id="gc-tour-bubble" className="group pointer-events-auto absolute top-0 left-1/2 z-50 w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-full rounded-2xl bg-white/95 p-3 text-[#1f2a24] shadow-xl sm:p-4 short:w-[min(20rem,calc(100vw-1.5rem))] short:p-2.5">
      <span className="absolute -bottom-2 left-[calc(50%+var(--tail,0px))] size-4 -translate-x-1/2 rotate-45 rounded-sm bg-white/95 group-data-[tail=0]:hidden" />
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/models/thumbs/${RECEPTIONIST_CHARACTER}.webp`} alt="" className="size-9 rounded-full bg-[#f6e3cf] short:size-7" />
        {t('title')}
        <span className="ms-auto text-xs text-[#6f7a73]">{step + 1}/{steps.length}</span>
      </div>
      <p className="max-h-40 overflow-y-auto text-sm leading-6 short:max-h-16 short:text-xs short:leading-5" dir="auto">{t(key)}</p>
      <div className="mt-3 flex gap-2 short:mt-1.5">
        {!last && <button type="button" className="btn min-h-10 text-[#6f7a73]" onClick={finish}>{t('skip')}</button>}
        <button type="button" disabled={!arrived} className="btn ms-auto min-h-10 bg-[#2f5d45] text-white disabled:opacity-60" onClick={next}>
          {!arrived ? <span className="inline-flex gap-1" aria-label={t('walking')}><Dot d={0} /><Dot d={150} /><Dot d={300} /></span> : last ? t('done') : t('next')}
        </button>
      </div>
    </div>
  );
}

const Dot = ({ d }: { d: number }) => <span className="size-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: `${d}ms` }} />;
