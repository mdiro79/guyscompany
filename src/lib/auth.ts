import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { isDemo, usernameToEmail } from '@/lib/env';
import { store, type Profile } from '@/lib/data';
import { supabaseServer, supabaseAdmin } from '@/lib/supabase/server';
import { DEMO_PASSWORD } from '@/lib/data/seed';

const DEMO_COOKIE = 'gc_demo_session';
const demoSecret = () => process.env.CRON_SECRET || 'guyscompany-demo-secret';
const sign = (v: string) => createHmac('sha256', demoSecret()).update(v).digest('hex');

// Demo passwords per user id (in memory); real mode uses Supabase Auth.
const g = globalThis as unknown as { gcDemoPasswords?: Map<string, string> };
const demoPasswords = () => (g.gcDemoPasswords ??= new Map());

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

export async function currentUser(): Promise<Profile | null> {
  if (isDemo) {
    const id = await demoUserId();
    return id ? store().getProfile(id) : null;
  }
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return data.user ? store().getProfile(data.user.id) : null;
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

export async function createAccount(input: { username: string; displayName: string; jobTitle: string; role: Profile['role']; password: string }) {
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
    characterId: 'humans-casual2-female', status: 'online', mustChangePassword: true, tutorialDone: false,
    createdAt: new Date().toISOString(),
  });
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
