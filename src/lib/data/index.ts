import 'server-only';
import { isDemo } from '@/lib/env';
import type { DataStore } from './types';
import { createMemoryStore } from './memory-store';
import { createDbStore } from './db-store';

const g = globalThis as unknown as { gcStore?: DataStore };

export function store(): DataStore {
  g.gcStore ??= isDemo ? createMemoryStore() : createDbStore();
  return g.gcStore;
}

export * from './types';
