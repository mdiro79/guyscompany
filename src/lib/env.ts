export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

// Without Supabase configuration the app runs in demo mode: in-memory data and demo accounts.
export const isDemo = !env.supabaseUrl || !env.supabaseAnonKey;

export const EMAIL_DOMAIN = 'guyscompany.local';

export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;
