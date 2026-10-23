import type { Instrumentation } from 'next';
import { recordServerError } from '@/lib/server-errors';

// Every server error (page render, server action, route, middleware): kept for the admin page and logged
// as one searchable line with the code shown on the error screen.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const e = error as { message?: unknown; digest?: unknown; code?: unknown; cause?: unknown } | null;
  const cause = (e?.cause as { message?: unknown; code?: unknown } | undefined) ?? undefined;
  const message = [e?.code, e?.message, cause?.code, cause?.message].filter((x) => typeof x === 'string' && x).join(' · ') || String(error);
  const entry = recordServerError({
    digest: typeof e?.digest === 'string' ? e.digest : null, message, path: request.path, route: context.routePath,
    kind: `${context.routeType}${context.renderSource ? `/${context.renderSource}` : ''}`,
  });
  console.error(`[server-error] digest=${entry.digest ?? '-'} ${entry.kind} ${entry.path} :: ${entry.message}`);
};
