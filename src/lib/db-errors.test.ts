import { it, expect } from 'vitest';
import { describeDbError, isConnectionError, isNotSentError } from './db-errors';

it('explains common database failures', () => {
  expect(describeDbError({ code: '42P01', message: 'relation "profiles" does not exist' })).toEqual({ code: '42P01', hint: 'tables' });
  expect(describeDbError({ code: '28P01' }).hint).toBe('auth');
  expect(describeDbError({ code: 'XX000', message: 'Tenant or user not found' }).hint).toBe('paused');
  expect(describeDbError({ code: 'ENOTFOUND' }).hint).toBe('network');
  expect(describeDbError(new Error('DATABASE_URL (or POSTGRES_URL from the Supabase integration) is not set')).hint).toBe('config');
  expect(describeDbError({ cause: { code: 'ECONNREFUSED' } }).hint).toBe('network');
  expect(describeDbError(null)).toEqual({ code: 'UNKNOWN', hint: 'unknown' });
});

it('retries only connection-level failures', () => {
  expect(isConnectionError({ code: 'CONNECTION_CLOSED' })).toBe(true);
  expect(isConnectionError({ code: 'QUERY_TIMEOUT' })).toBe(true);
  expect(isConnectionError({ code: '23505' })).toBe(false);
  // Supabase pooler under load or restarting
  expect(isConnectionError({ code: 'XX000', message: '(EDBHANDLEREXITED) connection to database closed' })).toBe(true);
  expect(isConnectionError({ code: 'XX000', message: 'Max client connections reached' })).toBe(true);
  expect(isConnectionError({ code: '53300' })).toBe(true);
  expect(isConnectionError({ code: 'XX000', message: 'Tenant or user not found' })).toBe(false);
});

it('repeats writes only when nothing reached the database', () => {
  expect(isNotSentError({ code: 'ECONNREFUSED' })).toBe(true);
  expect(isNotSentError({ code: 'CONNECT_TIMEOUT' })).toBe(true);
  expect(isNotSentError({ code: 'XX000', message: 'Max client connections reached' })).toBe(true);
  // The write may already have been applied
  expect(isNotSentError({ code: 'CONNECTION_CLOSED' })).toBe(false);
  expect(isNotSentError({ code: 'ECONNRESET' })).toBe(false);
});
