import { preload } from 'react-dom';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

// Banner image is a render of our own 3D office (public/hero/office.webp); the gradient shows until it exists.
export async function Hero() {
  const t = await getTranslations('home');
  // The banner is the largest thing above the fold: start downloading it with the HTML.
  preload('/hero/office.webp', { as: 'image', fetchPriority: 'high' });
  return (
    <section className="relative h-40 overflow-hidden rounded-2xl sm:h-48"
      style={{ background: 'url(/hero/office.webp) center/cover no-repeat, linear-gradient(120deg, #3b2a1f 0%, #8a4b23 45%, #f07a2a 75%, #1f8a8a 100%)' }}>
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent rtl:bg-gradient-to-l" />
      <div className="relative flex h-full flex-col justify-center gap-1 px-5 text-white sm:px-7">
        <h1 className="text-3xl font-extrabold drop-shadow sm:text-4xl">{t('heroTitle')}</h1>
        <p className="text-base opacity-90 sm:text-lg">{t('heroSub')}</p>
        <Link href="/office" className="mt-3 inline-flex w-fit items-center gap-2 rounded-xl bg-white/90 px-4 py-2 text-sm font-semibold text-[#1f2a24] hover:bg-white">
          {t('enterOffice')}<ArrowRight className="size-4 rtl:hidden" /><ArrowLeft className="size-4 ltr:hidden" />
        </Link>
      </div>
    </section>
  );
}
