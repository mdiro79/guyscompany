// Paths outside any locale (the root layout has no <html>, so this page brings its own).
export default function RootNotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f1ea', color: '#1f2a24', margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 20 }}>صفحه پیدا نشد · Page not found</h1>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: '#2f5d45' }}>Guyscompany</a>
        </div>
      </body>
    </html>
  );
}
