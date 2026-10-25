import { it, expect } from 'vitest';
import { recordServerError, recentServerErrors } from './server-errors';

it('keeps recent errors without secrets', () => {
  recordServerError({ digest: '123', message: 'connect failed postgres://user:pw@host:6543/db token eyJa.eyJb.sig', path: '/fa', route: '/[locale]', kind: 'render' });
  const [last] = recentServerErrors();
  expect(last.digest).toBe('123');
  expect(last.message).toBe('connect failed [url] token [token]');
  for (let i = 0; i < 40; i++) recordServerError({ digest: null, message: `e${i}`, path: '/', route: '/', kind: 'render' });
  expect(recentServerErrors()).toHaveLength(25);
  expect(recentServerErrors()[0].message).toBe('e39');
});
