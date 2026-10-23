import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env, serverEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-timeout';

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { fetch: fetchWithTimeout(8000) },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the middleware refreshes the session instead.
        }
      },
    },
  });
}

// Service-role client for admin operations (create/delete users, reset passwords, storage).
export function supabaseAdmin() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithTimeout(15000) } });
}
