import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'BeautyBook Admin',
  description: 'Internal platform administration for BeautyBook.',
  // Platform admin is an internal tool — never indexed, never linked
  // publicly. This is defense-in-depth, not access control.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
