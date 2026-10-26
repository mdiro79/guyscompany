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

it('asks a read again when the rows come back in the wrong shape', async () => {
  // drizzle mapping an array column of another query's row: "a.map is not a function"
  const listTasks = vi.fn().mockRejectedValueOnce(new TypeError('a.map is not a function')).mockResolvedValueOnce([]);
  const s = resilient({ listTasks } as unknown as DataStore);
  await expect(s.listTasks()).resolves.toEqual([]);
  expect(listTasks).toHaveBeenCalledTimes(2);

  // Writes are never repeated for it.
  const createTask = vi.fn().mockRejectedValue(new TypeError('a.map is not a function'));
  const t = resilient({ createTask } as unknown as DataStore);
  await expect(t.createTask({ title: 'x' })).rejects.toThrow(TypeError);
  expect(createTask).toHaveBeenCalledTimes(1);
});
