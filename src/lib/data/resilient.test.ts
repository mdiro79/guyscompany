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
