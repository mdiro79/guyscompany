import type { MetadataRoute } from 'next';

// Makes the site installable as an app (Android, Windows, iOS home screen). Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Guyscompany',
    short_name: 'Guyscompany',
    description: 'Better together — dashboard and virtual office',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    dir: 'auto',
    background_color: '#f6f1ea',
    theme_color: '#f6f1ea',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
