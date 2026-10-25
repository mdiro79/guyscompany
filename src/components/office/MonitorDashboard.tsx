'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

const READY_TIMEOUT_MS = 25_000; // no load event by then: start over
const MAX_RELOADS = 3;
const RELOAD_DELAY_MS = 1500;

type Status = 'loading' | 'ready' | 'retrying' | 'failed';

// The dashboard on the desk monitor (one iframe, kept between sittings so it keeps its state).
// It is loaded in the background as soon as `preload` is set, so sitting down shows it at once instead of
// starting a full page load then. While loading it shows a spinner instead of a blank screen; if the page
// fails (the error screen inside reports it) or never finishes, the iframe is reloaded a few times.
// While hidden it is told to pause live updates.
export function MonitorDashboard({ src, show, preload, labels }: {
  src: string; show: boolean; preload: boolean; labels: { loading: string; retrying: string; failed: string; retry: string };
}) {
  const [mounted, setMounted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const frame = useRef<HTMLIFrameElement>(null);
  const reloads = useRef(0);

  useEffect(() => { if (show || preload) setMounted(true); }, [show, preload]);

  const reload = useCallback((manual = false) => {
    if (manual) reloads.current = 0;
    if (reloads.current >= MAX_RELOADS) { setStatus('failed'); return; }
    reloads.current += 1;
    setStatus('retrying');
    setTimeout(() => setAttempt((a) => a + 1), manual ? 0 : RELOAD_DELAY_MS * reloads.current);
  }, []);

  // Stuck loading (a hung request): start over.
  useEffect(() => {
    if (!mounted || status === 'ready' || status === 'failed') return;
    const id = setTimeout(() => reload(), READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [mounted, status, attempt, reload]);

  // Fine for a while: later failures get their reloads again.
  useEffect(() => {
    if (status !== 'ready') return;
    const id = setTimeout(() => { reloads.current = 0; }, 120_000);
    return () => clearTimeout(id);
  }, [status]);

  // Live updates run only while the dashboard is on screen.
  const tell = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'gc-monitor-visible', visible: show }, window.location.origin);
  }, [show]);
  useEffect(tell, [tell]);

  // Messages from the dashboard: its error screen reports a failure; once listening it asks whether it is shown.
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'gc-embed-error') reload();
      if (e.data?.type === 'gc-embed-hello') tell();
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [reload, tell]);

  if (!mounted) return null;
  return (
    <>
      <iframe key={attempt} ref={frame} title="dashboard" src={src} className="size-full border-0"
        onLoad={() => {
          // A hosting error page (e.g. a time-out) also "loads": only our own page counts.
          if (!frame.current?.contentDocument?.body?.hasAttribute('data-gc')) { reload(); return; }
          setStatus((s) => (s === 'failed' ? s : 'ready'));
          tell();
        }} />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f6f1ea] p-4 text-center text-sm text-[#1f2a24]" role="status">
          {status === 'failed' ? (
            <>
              <p>{labels.failed}</p>
              <button type="button" className="flex min-h-11 items-center gap-2 rounded-xl bg-[#2f5d45] px-4 font-medium text-white"
                onClick={() => reload(true)}><RotateCw className="size-4" />{labels.retry}</button>
            </>
          ) : (
            <>
              <span className="size-8 animate-spin rounded-full border-[3px] border-[#2f5d45]/20 border-t-[#2f5d45]" />
              <p>{status === 'retrying' ? labels.retrying : labels.loading}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
