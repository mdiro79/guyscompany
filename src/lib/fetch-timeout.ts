// fetch with a time limit, for the Supabase clients on the server: a hung request to Supabase Auth
// (e.g. a session refresh) otherwise holds the whole page until the platform kills it.
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`request took longer than ${ms} ms`)), ms);
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  };
}
