import { createHmac, timingSafeEqual } from 'crypto';

// Verifies a legacy HS256 Supabase access token locally. Returns the user id, null when invalid,
// or undefined when it cannot decide (no secret configured or an asymmetric key).
export function verifyHs256(token: string, secret: string, now = Date.now()): string | null | undefined {
  const [h, p, sig] = token.split('.');
  if (!secret || !h || !p || !sig) return undefined;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    if (header.alg !== 'HS256') return undefined;
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
