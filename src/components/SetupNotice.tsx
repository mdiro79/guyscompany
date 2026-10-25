import { getTranslations } from 'next-intl/server';
import { AlertTriangle, Activity, RotateCw } from 'lucide-react';
import type { DbHint } from '@/lib/db-errors';

// Shown instead of a crash when Vercel is missing settings or the database cannot be reached.
export async function SetupNotice(props: { kind: 'config'; missing: string[] } | { kind: 'database'; code: string; hint: DbHint }) {
  const t = await getTranslations('setupNotice');
  return (
    <div className="space-y-4" role="alert">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-danger"><AlertTriangle className="size-5 shrink-0" />{props.kind === 'config' ? t('configTitle') : t('dbTitle')}</h1>
      {props.kind === 'config' ? (
        <>
          <p className="text-sm">{t('configIntro')}</p>
          <ul className="space-y-1">{props.missing.map((m) => <li key={m}><code dir="ltr" className="rounded-lg bg-surface-2 px-2 py-1 text-xs">{m}</code></li>)}</ul>
          <p className="rounded-xl bg-accent-soft p-3 text-sm leading-6">{t('configFix')}</p>
        </>
      ) : (
        <>
          <p className="text-sm">{t('dbIntro')}</p>
          <p className="rounded-xl bg-accent-soft p-3 text-sm leading-6">{t(`hint_${props.hint}`)}</p>
          <p className="text-xs text-muted">{t('code')}: <code dir="ltr">{props.code}</code></p>
        </>
      )}
      <div className="flex gap-2">
        {/* Plain links: a full reload re-runs the server checks. */}
        <a href="" className="btn-primary flex-1"><RotateCw className="size-4" />{t('retry')}</a>
        <a href="/api/health" target="_blank" rel="noreferrer" className="btn-ghost flex-1"><Activity className="size-4" />{t('status')}</a>
      </div>
    </div>
  );
}
