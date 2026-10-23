import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/ui/Logo';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('auth');
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-32 -start-32 size-96 rounded-full bg-accent-soft blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -end-32 size-96 rounded-full bg-teal-soft blur-3xl" />
      <LocaleSwitch className="absolute top-4 end-4" />
      <div className="card relative w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <div className="text-xl font-bold">Guyscompany</div>
            <div className="text-sm text-muted">{t('subtitle')}</div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
