import { it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyHs256 } from './jwt';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const make = (payload: object, secret: string, alg = 'HS256') => {
  const head = `${b64({ alg, typ: 'JWT' })}.${b64(payload)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
};
const now = Date.UTC(2026, 9, 23);
const exp = now / 1000 + 3600;

it('accepts a valid token and returns the user id', () => {
  expect(verifyHs256(make({ sub: 'u1', exp }, 's3cret'), 's3cret', now)).toBe('u1');
});

it('rejects a wrong signature, an expired token or one without a user', () => {
  expect(verifyHs256(make({ sub: 'u1', exp }, 'other'), 's3cret', now)).toBeNull();
  expect(verifyHs256(make({ sub: 'u1', exp: now / 1000 - 1 }, 's3cret'), 's3cret', now)).toBeNull();
  expect(verifyHs256(make({ role: 'anon', exp }, 's3cret'), 's3cret', now)).toBeNull();
  expect(verifyHs256('not.a.jwt', 's3cret', now)).toBeNull();
});

it('leaves asymmetric tokens and missing secrets to Supabase', () => {
  expect(verifyHs256(make({ sub: 'u1', exp }, 'x', 'ES256'), 's3cret', now)).toBeUndefined();
  expect(verifyHs256(make({ sub: 'u1', exp }, 's3cret'), '', now)).toBeUndefined();
});
