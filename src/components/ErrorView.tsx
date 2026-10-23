'use client';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Activity, Home, RotateCw } from 'lucide-react';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { isEmbedded } from '@/lib/device';

const AUTO_RETRY_KEY = 'gc_error_auto_retry';
const AUTO_RETRY_EVERY_MS = 30_000;
const RETRY_WATCHDOG_MS = 12_000;
// Fallback when sessionStorage is blocked, so the automatic retry can never loop.
let lastAutoRetry = 0;
// After a new deploy an open page asks for code or server actions that no longer exist; only a reload fixes it.
const STALE_BUILD = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to find Server Action|was not found on the server/i;

// Shared body of the error boundaries: retry, go home, or open the server status page.
// Most failures are passing (a dropped database connection, a deploy), so the first one is retried automatically.
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  const router = useRouter();
  // Retrying is tied to the error it was started for; a new error shows the buttons again.
  const [retryOf, setRetryOf] = useState<Error | null>(null);
  const retrying = retryOf === error;
  // reset() alone re-renders the client tree only; the server part is fetched again with refresh().
  const retry = useCallback(() => {
    setRetryOf(error);
    startTransition(() => { router.refresh(); reset(); });
  }, [error, router, reset]);
  // A retry whose request hangs never settles (the button stayed on "Trying again…"): reload the page instead.
  useEffect(() => {
    if (!retrying) return;
    const id = setTimeout(() => window.location.reload(), RETRY_WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [retrying]);

  useEffect(() => {
    console.error(error);
    // On the office desk monitor the office reloads the dashboard itself (see MonitorDashboard).
    if (isEmbedded()) { window.parent.postMessage({ type: 'gc-embed-error' }, window.location.origin); return; }
    let last = lastAutoRetry;
    try { last = Math.max(last, Number(sessionStorage.getItem(AUTO_RETRY_KEY)) || 0); } catch { /* storage blocked */ }
    if (Date.now() - last < AUTO_RETRY_EVERY_MS) return;
    const id = setTimeout(() => {
      lastAutoRetry = Date.now();
      try { sessionStorage.setItem(AUTO_RETRY_KEY, String(lastAutoRetry)); } catch { /* storage blocked */ }
      if (STALE_BUILD.test(`${error.name} ${error.message}`)) window.location.reload();
      else retry();
    }, 500);
    return () => clearTimeout(id);
  }, [error, retry]);

  return (
    <div className="relative flex min-h-[60dvh] items-center justify-center p-4">
      <LocaleSwitch className="absolute top-3 end-3" />
      <div className="card w-full max-w-md space-y-4 p-6 text-center" role="alert">
        <AlertTriangle className="mx-auto size-10 text-accent" />
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-sm leading-6 text-muted">{t('body')}</p>
        {error.digest && <p className="text-xs text-muted">{t('code')}: <code dir="ltr">{error.digest}</code></p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={retry} disabled={retrying}>
            <RotateCw className={retrying ? 'size-4 animate-spin' : 'size-4'} />{retrying ? t('retrying') : t('retry')}
          </button>
          {/* Full reloads, so a broken client state cannot keep the error around. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn-ghost"><Home className="size-4" />{t('home')}</a>
          <a href="/api/health" target="_blank" rel="noreferrer" className="btn-ghost"><Activity className="size-4" />{t('status')}</a>
        </div>
      </div>
    </div>
  );
}
