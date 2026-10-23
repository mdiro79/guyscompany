'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { setTutorialDoneAction } from '@/app/actions/profile';
import { tour, useTourStep, stepArrived } from './tour';
import { Check, ChevronRight } from 'lucide-react';
import { RECEPTIONIST_CHARACTER } from './Receptionist';
import { SpeechBubble, BubbleButton, TAIL_HEIGHT } from './SpeechBubble';

// Speech panel of the receptionist's guided tour (first visit, or press E next to her to replay).
export function Tutorial({ markDone }: { markDone: boolean }) {
  const t = useTranslations('tutorial');
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
    if (markDone) void setTutorialDoneAction(true);
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
    // Speech bubble above the receptionist's head (positioned by TourBubbleAnchor inside the 3D scene); the bottom padding is the tail's room.
    <div id="gc-tour-bubble" className="group pointer-events-auto absolute top-0 left-1/2 z-50 w-[min(23rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-full short:w-[min(21rem,calc(100vw-2.5rem))]"
      style={{ paddingBottom: TAIL_HEIGHT }}>
      <SpeechBubble characterId={RECEPTIONIST_CHARACTER} title={t('title')} chip={`${step + 1}/${steps.length}`}
        action={
          <>
            {!last && <button type="button" className="me-auto min-h-11 px-1 text-xs font-medium text-[#6f7a73] hover:text-[#1f2a24]" onClick={finish}>{t('skip')}</button>}
            <BubbleButton onClick={next} disabled={!arrived} label={!arrived ? t('walking') : last ? t('done') : t('next')}>
              {!arrived ? <span className="inline-flex gap-1"><Dot d={0} /><Dot d={150} /><Dot d={300} /></span>
                : last ? <Check className="size-5" /> : <ChevronRight className="size-5 rtl:-scale-x-100" />}
            </BubbleButton>
          </>
        }>
        <p className="max-h-40 overflow-y-auto short:max-h-16">{t(key)}</p>
      </SpeechBubble>
    </div>
  );
}

const Dot = ({ d }: { d: number }) => <span className="size-1.5 animate-bounce rounded-full bg-white" style={{ animationDelay: `${d}ms` }} />;
