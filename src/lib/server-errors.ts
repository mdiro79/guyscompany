// The last server errors of this server instance (memory only, cleared on restart), shown to admins
// on the admin page with the code users see on the error screen ("digest"), so a report can be
// matched to its cause without opening the hosting logs.
export interface ServerError { at: string; digest: string | null; message: string; path: string; route: string; kind: string }

const MAX = 25;
const g = globalThis as unknown as { gcServerErrors?: ServerError[] };

// Error texts never carry connection strings or tokens to the page.
const clean = (s: string) => s.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]').slice(0, 400);

export function recordServerError(e: Omit<ServerError, 'at' | 'message'> & { message: string }) {
  const list = (g.gcServerErrors ??= []);
  const entry = { ...e, message: clean(e.message), at: new Date().toISOString() };
  list.unshift(entry);
  list.length = Math.min(list.length, MAX);
  return entry;
}

export const recentServerErrors = (): ServerError[] => [...(g.gcServerErrors ?? [])];
