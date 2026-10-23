'use client';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Languages } from 'lucide-react';

export function LocaleSwitch({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === 'fa' ? 'en' : 'fa';
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={next === 'en' ? 'English' : 'فارسی'}
      onClick={() => router.replace(pathname, { locale: next })}>
      <Languages className="size-5" />
      <span className="sr-only">{next}</span>
    </button>
  );
}
