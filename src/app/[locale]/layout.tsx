import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing, localeDirection } from '@/i18n/routing';
import '@fontsource-variable/vazirmatn';
import '@fontsource-variable/inter';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Guyscompany',
  description: 'Better together — dashboard and virtual office',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#15130f' },
  ],
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const theme = (await cookies()).get('gc_theme')?.value === 'dark' ? 'dark' : '';
  const messages = await getMessages();
  return (
    <html lang={locale} dir={localeDirection(locale)} className={theme} suppressHydrationWarning>
      {/* data-gc marks our own pages (the office monitor tells them apart from a hosting error page). */}
      <body className="min-h-dvh antialiased" data-gc="app">
        <NextIntlClientProvider messages={messages} locale={locale}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
