import type { ReactNode } from 'react';

// The <html> element is rendered by app/[locale]/layout.tsx.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
