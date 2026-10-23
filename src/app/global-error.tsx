'use client';

// Last-resort boundary (the locale layout itself failed): no translations are available here, so both languages are shown.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f1ea', color: '#1f2a24', margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.7 }}>
          <h1 style={{ fontSize: 20 }}>مشکلی پیش آمد · Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.8 }}>دوباره تلاش کنید. اگر تکرار شد، وضعیت سرور را ببینید.<br />Try again. If it keeps happening, check the server status.</p>
          {error.digest && <p style={{ fontSize: 12, opacity: 0.6 }} dir="ltr">{error.digest}</p>}
          <p style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" onClick={reset} style={{ padding: '10px 16px', borderRadius: 12, border: 0, background: '#2f5d45', color: '#fff' }}>تلاش دوباره · Retry</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/health" style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid #d8cfc2', color: 'inherit', textDecoration: 'none' }}>وضعیت سرور · Status</a>
          </p>
        </div>
      </body>
    </html>
  );
}
