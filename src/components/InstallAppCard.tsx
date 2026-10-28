'use client';
import { useTranslations } from 'next-intl';
import { Download, CheckCircle2 } from 'lucide-react';
import { promptInstall, useInstallState } from '@/lib/pwa';

export function InstallAppCard() {
  const t = useTranslations('settings');
  const state = useInstallState();
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Download className="size-5" />{t('installApp')}</h2>
      {state === 'installed' ? (
        <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 text-brand" />{t('installDone')}</p>
      ) : (
        <>
          <p className="text-sm text-muted">{t('installNote')}</p>
          {state === 'prompt' && <button type="button" className="btn-primary" onClick={() => void promptInstall()}><Download className="size-4" />{t('installButton')}</button>}
          {state === 'ios' && <p className="text-sm">{t('installIos')}</p>}
          {state === 'manual' && <p className="text-sm">{t('installManual')}</p>}
        </>
      )}
    </section>
  );
}
