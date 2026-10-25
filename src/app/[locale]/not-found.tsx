import { getTranslations } from 'next-intl/server';
import { Compass } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';

export default async function NotFound() {
  const t = await getTranslations('errors');
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <LocaleSwitch className="absolute top-4 end-4" />
      <div className="card w-full max-w-md space-y-3 p-6 text-center">
        <Compass className="mx-auto size-10 text-brand" />
        <h1 className="text-lg font-semibold">{t('notFoundTitle')}</h1>
        <p className="text-sm text-muted">{t('notFoundBody')}</p>
        <Link href="/" className="btn-primary">{t('home')}</Link>
      </div>
    </main>
  );
}
