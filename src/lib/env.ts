// Reads both our own variable names and the ones the Vercel ↔ Supabase integration creates,
// so importing the repo in Vercel and adding the Supabase integration needs no manual setup.
// (NEXT_PUBLIC_* values are mapped from integration names in next.config.ts.)
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const serverEnv = () => ({
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
  // Pooled connection for the app (Supabase pooler, transaction mode).
  databaseUrl: cleanDbUrl(process.env.DATABASE_URL || process.env.POSTGRES_URL || ''),
  // Direct connection for migrations.
  directUrl: cleanDbUrl(process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL || ''),
});

// Integration URLs carry extra query parameters (e.g. `supa=…`) that Postgres would reject as settings.
export function cleanDbUrl(url: string) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const sslmode = u.searchParams.get('sslmode');
    u.search = sslmode ? `?sslmode=${sslmode}` : '';
    return u.toString();
  } catch {
    return url;
  }
}

// Without Supabase configuration the app runs in demo mode: in-memory data and demo accounts.
export const isDemo = !env.supabaseUrl || !env.supabaseAnonKey;

export const EMAIL_DOMAIN = 'guyscompany.local';

export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;
