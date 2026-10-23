import 'server-only';
import { cache } from 'react';
import { isDemo } from '@/lib/env';
import type { DataStore } from './types';
import { createMemoryStore } from './memory-store';
import { createDbStore } from './db-store';

const g = globalThis as unknown as { gcStore?: DataStore };

// Reads the layout and the page both make (tasks, projects, profiles…) run once per request.
// React's cache only memoises while rendering; server actions and route handlers always read fresh data.
const SHARED_READS = ['listProfiles', 'getProfile', 'listOffices', 'listTasks', 'listProjects', 'listFiles', 'listPolls', 'listVotes', 'listRoles', 'listMessages'] as const;

function withRequestCache(s: DataStore): DataStore {
  const out: DataStore = { ...s };
  for (const k of SHARED_READS) (out as unknown as Record<string, unknown>)[k] = cache(s[k]);
  return out;
}

export function store(): DataStore {
  g.gcStore ??= withRequestCache(isDemo ? createMemoryStore() : createDbStore());
  return g.gcStore;
}

export * from './types';
