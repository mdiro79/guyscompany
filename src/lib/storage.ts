import 'server-only';
import { isDemo } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';
import { STORAGE_BUCKET } from '@/lib/limits';

// Demo mode keeps file bytes in memory; real mode uses Supabase Storage (private bucket).
const g = globalThis as unknown as { gcFiles?: Map<string, Buffer> };
const mem = () => (g.gcFiles ??= new Map());

export async function putObject(path: string, bytes: Buffer, mime: string) {
  if (isDemo) { mem().set(path, bytes); return; }
  const { error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
}

export async function getObjectUrl(path: string, downloadName: string): Promise<string | null> {
  if (isDemo) return null;
  const { data } = await supabaseAdmin().storage.from(STORAGE_BUCKET).createSignedUrl(path, 60, { download: downloadName });
  return data?.signedUrl ?? null;
}

export const getDemoObject = (path: string) => mem().get(path) ?? null;

export async function removeObject(path: string) {
  if (isDemo) { mem().delete(path); return; }
  await supabaseAdmin().storage.from(STORAGE_BUCKET).remove([path]);
}
