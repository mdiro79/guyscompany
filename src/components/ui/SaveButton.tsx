'use client';
import { useEffect, useRef, useState, useTransition, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { Check, Loader2, AlertCircle } from 'lucide-react';

export type SaveStatus = 'idle' | 'saved' | 'error';
const failed = (r: unknown) => !!r && typeof r === 'object' && 'ok' in r && !(r as { ok: boolean }).ok;

// Shows "Saved" for a moment after success and a retry hint after a failure.
function useFlash() {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = (s: SaveStatus) => {
    setStatus(s);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus('idle'), s === 'saved' ? 2000 : 6000);
  };
  return [status, flash] as const;
}

// Runs a server action with visible progress: pending while it runs, then saved or error.
// `onFail` undoes an optimistic change.
export function useSave() {
  const [pending, start] = useTransition();
  const [status, flash] = useFlash();
  const run = (fn: () => Promise<unknown>, onFail?: () => void) => start(async () => {
    let ok = false;
    try { ok = !failed(await fn()); } catch { ok = false; }
    if (!ok) onFail?.();
    flash(ok ? 'saved' : 'error');
  });
  return { run, pending, status };
}

// The same feedback for a form driven by useActionState: pass its latest result.
export function useResultStatus(result: unknown) {
  const [status, flash] = useFlash();
  const seen = useRef(result);
  useEffect(() => {
    if (result === seen.current) return;
    seen.current = result;
    if (result) flash(failed(result) ? 'error' : 'saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  return status;
}

export function SaveButton({ pending, status = 'idle', children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; status?: SaveStatus }) {
  const t = useTranslations('common');
  return (
    <span className={clsx('inline-flex flex-col items-end gap-1', className?.includes('w-full') && 'w-full')}>
      <button {...rest} disabled={disabled || pending} aria-busy={pending}
        className={clsx(className ?? 'btn-primary', 'relative transition-all', status === 'saved' && '!bg-brand !opacity-100', status === 'error' && 'ring-2 ring-danger')}>
        {pending ? <><Loader2 className="size-4 animate-spin" />{t('saving')}</>
          : status === 'saved' ? <span className="gc-pop inline-flex items-center gap-1.5"><Check className="size-4" />{t('saved')}</span>
          : children}
      </button>
      {status === 'error' && <span role="alert" className="flex items-center gap-1 text-xs text-danger"><AlertCircle className="size-3.5" />{t('saveError')}</span>}
    </span>
  );
}
