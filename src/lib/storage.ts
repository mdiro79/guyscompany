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

// Browser uploads go straight to Storage with a one-time signed URL (Vercel limits request bodies to ~4.5 MB).
export async function createUploadUrl(path: string) {
  const { data, error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? 'SIGN_FAILED');
  return data.token;
}

export async function objectSize(path: string): Promise<number | null> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await supabaseAdmin().storage.from(STORAGE_BUCKET).list(dir, { search: name, limit: 1 });
  const hit = data?.find((o) => o.name === name);
  return hit ? Number((hit.metadata as { size?: number } | null)?.size ?? 0) : null;
}
