import { it, expect, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { guard } from './result';

it('turns a thrown error into a failed result', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const save = guard(async function save() { throw new Error('CONNECTION_CLOSED'); });
  await expect(save()).resolves.toEqual({ ok: false, error: 'error', data: undefined });
  const list = guard(async function list(): Promise<string[]> { throw new Error('UNAUTHENTICATED'); }, []);
  await expect(list()).resolves.toEqual([]);
});

it('lets redirects through', async () => {
  const go = guard(async function go() { redirect('/fa/login'); });
  await expect(go()).rejects.toThrow('NEXT_REDIRECT');
});
