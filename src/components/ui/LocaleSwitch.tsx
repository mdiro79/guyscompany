'use client';
import clsx from 'clsx';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Languages } from 'lucide-react';

// Visible language switch for the top of every page: shows the language it switches to.
// `dark` is the translucent style used over the 3D office.
export function LocaleSwitch({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const next = locale === 'fa' ? 'en' : 'fa';
  return (
    <button type="button" lang={next} aria-label={next === 'en' ? 'English' : 'فارسی'} title={next === 'en' ? 'English' : 'فارسی'}
      // The query is read at click time (useSearchParams would opt static pages out of prerendering).
      onClick={() => router.replace(`${pathname}${window.location.search}`, { locale: next })}
      className={clsx('flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
        dark ? 'rounded-xl bg-black/55 text-white backdrop-blur hover:bg-black/70' : 'border border-line bg-surface hover:bg-surface-2', className)}>
      <Languages className="size-4" />
      <span>{next === 'en' ? 'EN' : 'فا'}</span>
    </button>
  );
}
