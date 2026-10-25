import { unstable_rethrow } from 'next/navigation';

export type ActionResult = { ok: boolean; error?: string; message?: string; data?: Record<string, string> };

export const fail = (error: string, data?: Record<string, string>): ActionResult => ({ ok: false, error, data });
export const okResult = (message?: string, data?: Record<string, string>): ActionResult => ({ ok: true, message, data });

// Server actions never throw to the browser: a thrown error (a dropped database connection, an expired
// session) would replace the whole page with the error screen. The cause is logged under the action's
// name for the Vercel logs and the caller gets a normal failed result. Redirects pass through.
export function guard<A extends unknown[], R>(fn: (...args: A) => Promise<R>, fallback: R = fail('error') as R) {
  return async (...args: A): Promise<R> => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      console.error(`[action] ${fn.name} failed:`, e);
      return fallback;
    }
  };
}
