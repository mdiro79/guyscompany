import 'server-only';
import { isDemo, USERNAME_PATTERN, usernameToEmail } from '@/lib/env';
import { store } from '@/lib/data';
import { createAccount, setDemoPassword } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

const g = globalThis as unknown as { gcAdminReady?: Promise<void> };

/**
 * Creates the admin account from Vercel environment variables (ADMIN_USERNAME, ADMIN_PASSWORD,
 * optional ADMIN_DISPLAY_NAME) the first time it is needed. An existing account is never overwritten,
 * so a password changed inside the app stays changed.
 */
export function ensureEnvAdmin(): Promise<void> {
  g.gcAdminReady ??= run().catch((e) => { g.gcAdminReady = undefined; console.error('[admin] bootstrap failed:', e); });
  return g.gcAdminReady;
}

async function run() {
  const username = (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!username || !password) return;
  if (!USERNAME_PATTERN.test(username) || password.length < 8) {
    console.error('[admin] ADMIN_USERNAME must be 3–24 chars (a-z 0-9 . _ -) and ADMIN_PASSWORD at least 8 chars');
    return;
  }
  const displayName = (process.env.ADMIN_DISPLAY_NAME ?? '').trim() || username;
  const s = store();
  if (await s.getProfileByUsername(username)) return;

  if (isDemo) {
    // Demo data already has an admin; give it the configured name and password.
    const admin = (await s.listProfiles()).find((p) => p.role === 'admin');
    if (admin) {
      await s.updateProfile(admin.id, { username, displayName });
      setDemoPassword(admin.id, password);
      return;
    }
  }

  let id: string;
  try {
    id = await createAccount({ username, displayName, jobTitle: '', role: 'admin', password, mustChangePassword: false });
  } catch (e) {
    // The auth user may exist from an earlier attempt without a profile row: reuse it.
    if (isDemo) throw e;
    const { data } = await supabaseAdmin().auth.admin.listUsers({ perPage: 100 });
    const existing = data?.users.find((u) => u.email === usernameToEmail(username));
    if (!existing) throw e;
    await supabaseAdmin().auth.admin.updateUserById(existing.id, { password });
    await s.insertProfile({
      id: existing.id, username, displayName, jobTitle: '', role: 'admin', characterId: 'humans-casual2-female',
      status: 'online', mustChangePassword: false, tutorialDone: false, createdAt: new Date().toISOString(),
    });
    id = existing.id;
  }
  const office = (await s.listOffices()).find((o) => o.slot === 1);
  if (office && !office.ownerId) await s.updateOffice(1, { ownerId: id });
  console.log(`[admin] created admin account "${username}"`);
}
