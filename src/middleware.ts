import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { routing } from './i18n/routing';
import { fetchWithTimeout } from './lib/fetch-timeout';

const intl = createIntlMiddleware(routing);
const LOCALES = routing.locales.join('|');
const LOCALE_PATH = new RegExp(`^/(${LOCALES})(?:/|$)`);
// Pages that work without signing in; every other page under a locale needs a session.
const PUBLIC_PATH = new RegExp(`^/(?:${LOCALES})/(?:login|setup)(?:/|$)`);

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const refreshed: { name: string; value: string; options: CookieOptions }[] = [];
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-') || c.name === 'gc_demo_session');
  const { pathname } = request.nextUrl;

  // Visitors without a session go straight to the login page from the edge, instead of rendering
  // a protected page on the server only to be redirected (the first visit used to take two hops).
  const locale = LOCALE_PATH.exec(pathname)?.[1];
  if (!hasSession && locale && !PUBLIC_PATH.test(pathname)) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // Refresh an expired Supabase session before rendering. The new cookies are written to the request too,
  // so the page sees the fresh token instead of refreshing (and racing) again; next-intl forwards them.
  if (url && key && hasSession) {
    try {
      const supabase = createServerClient(url, key, {
        global: { fetch: fetchWithTimeout(6000) },
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
  // "/" → "/fa" for someone signed out continues to the login page in the same redirect.
  const target = response.headers.get('location');
  if (target && !hasSession) {
    const to = new URL(target, request.url);
    if (new RegExp(`^/(${LOCALES})/?$`).test(to.pathname)) {
      to.pathname = `${to.pathname.replace(/\/$/, '')}/login`;
      response.headers.set('location', to.toString());
    }
  }
  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|models|hero|.*\\..*).*)'],
};
