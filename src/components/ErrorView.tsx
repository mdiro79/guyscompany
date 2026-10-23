'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Activity, Home, RotateCw } from 'lucide-react';

// Shared body of the error boundaries: retry, go home, or open the server status page.
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4 p-6 text-center" role="alert">
        <AlertTriangle className="mx-auto size-10 text-accent" />
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-sm leading-6 text-muted">{t('body')}</p>
        {error.digest && <p className="text-xs text-muted">{t('code')}: <code dir="ltr">{error.digest}</code></p>}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={reset}><RotateCw className="size-4" />{t('retry')}</button>
          {/* Full reloads, so a broken client state cannot keep the error around. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn-ghost"><Home className="size-4" />{t('home')}</a>
          <a href="/api/health" target="_blank" rel="noreferrer" className="btn-ghost"><Activity className="size-4" />{t('status')}</a>
        </div>
      </div>
    </div>
  );
}
