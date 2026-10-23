import { getTranslations } from 'next-intl/server';
import { ProgressBar } from '@/components/ui/ProgressBar';

export default async function OfficeLoading() {
  const t = await getTranslations('office');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a221c]" aria-busy="true">
      <div className="w-[min(20rem,80vw)]"><ProgressBar percent={null} label={t('loading')} dark /></div>
    </div>
  );
}
