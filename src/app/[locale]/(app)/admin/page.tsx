import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { requirePageUser } from '@/lib/auth';
import { AdminView } from '@/components/pages/AdminView';
import { recentServerErrors } from '@/lib/server-errors';
import { formatDate, formatTime } from '@/lib/format';

export default async function AdminPage() {
  const user = await requirePageUser();
  const locale = await getLocale();
  if (user.role !== 'admin') redirect(`/${locale}`);
  const t = await getTranslations('admin');
  const errors = recentServerErrors();
  return (
    <div className="space-y-4">
      <AdminView />
      <section className="card space-y-3 p-4">
        <div>
          <h2 className="font-semibold">{t('recentErrors')}</h2>
          <p className="text-xs text-muted">{t('recentErrorsNote')}</p>
        </div>
        {errors.length === 0 ? <p className="text-sm text-muted">{t('noErrors')}</p> : (
          <ul className="space-y-2 text-sm" dir="ltr">
            {errors.map((e, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{formatDate(locale, e.at)} {formatTime(locale, e.at)}</span>
                  {e.digest && <code className="rounded bg-surface px-1.5 font-semibold text-ink">{e.digest}</code>}
                  <span>{e.kind}</span>
                  <span className="truncate">{e.path}</span>
                </div>
                <p className="mt-1 break-words font-mono text-xs">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
