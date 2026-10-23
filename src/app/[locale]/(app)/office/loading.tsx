import { getTranslations } from 'next-intl/server';

export default async function OfficeLoading() {
  const t = await getTranslations('office');
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#2a221c] text-white" aria-busy="true">
      <div className="size-12 animate-spin rounded-full border-4 border-white/20 border-t-[#f07a2a]" />
      <p className="text-sm text-white/80">{t('loading')}</p>
    </div>
  );
}
