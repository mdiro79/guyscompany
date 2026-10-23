import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { routing } from './i18n/routing';

const intl = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const refreshed: { name: string; value: string; options: CookieOptions }[] = [];

  // Refresh an expired Supabase session before rendering. The new cookies are written to the request too,
  // so the page sees the fresh token instead of refreshing (and racing) again; next-intl forwards them.
  if (url && key && request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list) => {
            for (const c of list) { request.cookies.set(c.name, c.value); refreshed.push(c); }
          },
        },
      });
      // No network request unless the access token has expired.
      await supabase.auth.getSession();
    } catch (e) {
      console.error('[middleware] session refresh failed:', e);
    }
  }

  const response = intl(request);
  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|models|hero|.*\\..*).*)'],
};
