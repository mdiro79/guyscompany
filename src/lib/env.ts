// Reads both our own variable names and the ones the Vercel ↔ Supabase integration creates,
// so importing the repo in Vercel and adding the Supabase integration needs no manual setup.
// (NEXT_PUBLIC_* values are mapped from integration names in next.config.ts.)
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const serverEnv = () => ({
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
  // Legacy (HS256) JWT secret, set by the Vercel integration; lets the server verify sessions without a network call.
  jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
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

// Names of required variables that are missing in Supabase mode (values are never exposed).
export function configProblems(): string[] {
  if (isDemo) return [];
  const s = serverEnv();
  const missing: string[] = [];
  if (!s.databaseUrl) missing.push('POSTGRES_URL / DATABASE_URL');
  if (!s.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

// Supabase pooler hosts name their AWS region (aws-0-eu-central-1.pooler.supabase.com).
const AWS_TO_VERCEL: Record<string, string> = {
  'us-east-1': 'iad1', 'us-east-2': 'cle1', 'us-west-1': 'sfo1', 'us-west-2': 'pdx1', 'ca-central-1': 'yul1',
  'eu-central-1': 'fra1', 'eu-central-2': 'fra1', 'eu-west-1': 'dub1', 'eu-west-2': 'lhr1', 'eu-west-3': 'cdg1', 'eu-north-1': 'arn1',
  'ap-south-1': 'bom1', 'ap-southeast-1': 'sin1', 'ap-southeast-2': 'syd1', 'ap-northeast-1': 'hnd1', 'ap-northeast-2': 'icn1',
  'sa-east-1': 'gru1', 'me-central-1': 'dxb1',
};

export function databaseRegion(url = serverEnv().databaseUrl) {
  const m = /aws-\d+-([a-z]+-[a-z]+-\d)\./.exec(url);
  return m ? { aws: m[1], vercel: AWS_TO_VERCEL[m[1]] ?? null } : null;
}

export const EMAIL_DOMAIN = 'guyscompany.local';

export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;
