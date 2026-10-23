import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { isDemo, serverEnv, usernameToEmail } from '@/lib/env';
import { store, type Profile } from '@/lib/data';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { DEMO_PASSWORD } from '@/lib/data/seed';
import { verifyHs256 } from '@/lib/jwt';

const DEMO_COOKIE = 'gc_demo_session';
const demoSecret = () => process.env.CRON_SECRET || 'guyscompany-demo-secret';
const sign = (v: string) => createHmac('sha256', demoSecret()).update(v).digest('hex');

// Demo passwords per user id (in memory); real mode uses Supabase Auth.
const g = globalThis as unknown as { gcDemoPasswords?: Map<string, string> };
const demoPasswords = () => (g.gcDemoPasswords ??= new Map());
export const setDemoPassword = (userId: string, password: string) => { demoPasswords().set(userId, password); };

async function setDemoSession(userId: string) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
}

async function demoUserId(): Promise<string | null> {
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  const [id, mac] = raw.split('.');
  const expected = sign(id);
  if (!mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return id;
}

async function sessionUserId(): Promise<string | null> {
  if (isDemo) return demoUserId();
  try {
    const supabase = await supabaseServer();
    // The middleware has already refreshed an expired session, so this reads the cookie without a request.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const local = verifyHs256(session.access_token, serverEnv().jwtSecret);
    if (local !== undefined) return local;
    // Asymmetric signing keys are verified locally against the cached JWKS; legacy keys fall back to the Auth server.
    const { data } = await supabase.auth.getClaims(session.access_token);
    return typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  } catch (e) {
    console.error('[auth] session check failed:', e);
    return null;
  }
}

// Memoised per request: the layout and the page share one session check and one profile query.
export const currentUser = cache(async (): Promise<Profile | null> => {
  const id = await sessionUserId();
  return id ? store().getProfile(id) : null;
});

// For pages: layouts and pages render in parallel, so a page cannot rely on the layout's redirect.
export async function requirePageUser(): Promise<Profile> {
  const user = await currentUser();
  if (!user) redirect(`/${await getLocale()}/login`);
  return user;
}

export async function requireUser(): Promise<Profile> {
  const user = await currentUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function requireAdmin(): Promise<Profile> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('FORBIDDEN');
  return user;
}

export async function signIn(username: string, password: string): Promise<Profile | null> {
  const { ensureEnvAdmin } = await import('@/lib/bootstrap');
  await ensureEnvAdmin();
  const name = username.trim().toLowerCase();
  if (isDemo) {
    const profile = await store().getProfileByUsername(name);
    if (!profile) return null;
    if ((demoPasswords().get(profile.id) ?? DEMO_PASSWORD) !== password) return null;
    await setDemoSession(profile.id);
    return profile;
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(name), password });
  if (error || !data.user) return null;
  return store().getProfile(data.user.id);
}

export async function signOut() {
  if (isDemo) {
    (await cookies()).delete(DEMO_COOKIE);
    return;
  }
  await (await supabaseServer()).auth.signOut();
}

export async function changeOwnPassword(user: Profile, newPassword: string) {
  if (isDemo) demoPasswords().set(user.id, newPassword);
  else {
    const { error } = await (await supabaseServer()).auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }
  await store().updateProfile(user.id, { mustChangePassword: false });
}

export async function createAccount(input: { username: string; displayName: string; jobTitle: string; role: Profile['role']; password: string; mustChangePassword?: boolean }): Promise<string> {
  const username = input.username.trim().toLowerCase();
  if (await store().getProfileByUsername(username)) throw new Error('USERNAME_TAKEN');
  let id: string = crypto.randomUUID();
  if (isDemo) demoPasswords().set(id, input.password);
  else {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: usernameToEmail(username), password: input.password, email_confirm: true,
    });
    if (error || !data.user) throw new Error(error?.message ?? 'CREATE_FAILED');
    id = data.user.id;
  }
  await store().insertProfile({
    id, username, displayName: input.displayName || username, jobTitle: input.jobTitle, role: input.role,
    characterId: 'humans-casual2-female', status: 'online', mustChangePassword: input.mustChangePassword ?? true, tutorialDone: false,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function deleteAccount(id: string) {
  if (!isDemo) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  }
  await store().deleteProfile(id);
}

// Admin password recovery: sets a temporary password and forces a change on next login.
export async function resetPassword(id: string, tempPassword: string) {
  if (isDemo) demoPasswords().set(id, tempPassword);
  else {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: tempPassword });
    if (error) throw new Error(error.message);
  }
  await store().updateProfile(id, { mustChangePassword: true });
}
