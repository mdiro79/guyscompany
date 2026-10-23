import { it, expect, vi } from 'vitest';
import { resilient } from './db-store';
import type { DataStore } from './types';

const fails = (code: string) => Object.assign(new Error(code), { code });

it('retries a read once after a dropped connection', async () => {
  const listOffices = vi.fn().mockRejectedValueOnce(fails('CONNECTION_CLOSED')).mockResolvedValueOnce([]);
  const s = resilient({ listOffices } as unknown as DataStore);
  await expect(s.listOffices()).resolves.toEqual([]);
  expect(listOffices).toHaveBeenCalledTimes(2);
});

it('does not retry query errors', async () => {
  const createTask = vi.fn().mockRejectedValue(fails('23505'));
  const s = resilient({ createTask } as unknown as DataStore);
  await expect(s.createTask({ title: 'x' })).rejects.toThrow('23505');
  expect(createTask).toHaveBeenCalledTimes(1);
});

it('gives up after the second failure', async () => {
  const listTasks = vi.fn().mockRejectedValue(fails('ECONNRESET'));
  const s = resilient({ listTasks } as unknown as DataStore);
  await expect(s.listTasks()).rejects.toThrow('ECONNRESET');
  expect(listTasks).toHaveBeenCalledTimes(2);
});

it('repeats a write only when it never reached the database', async () => {
  const updateOffice = vi.fn().mockRejectedValueOnce(fails('ECONNREFUSED')).mockResolvedValueOnce(undefined);
  const s = resilient({ updateOffice } as unknown as DataStore);
  await expect(s.updateOffice(1, { locked: true })).resolves.toBeUndefined();
  expect(updateOffice).toHaveBeenCalledTimes(2);

  // A connection lost mid-write may already have applied it: no second attempt.
  const createMessage = vi.fn().mockRejectedValue(fails('CONNECTION_CLOSED'));
  const t = resilient({ createMessage } as unknown as DataStore);
  await expect(t.createMessage({ channel: 'team', authorId: null, body: 'x', fileId: null })).rejects.toThrow('CONNECTION_CLOSED');
  expect(createMessage).toHaveBeenCalledTimes(1);
});
