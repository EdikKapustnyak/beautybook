import type { ReactNode } from 'react';

export default function AdminHomePage(): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">BeautyBook Admin</h1>
      <p className="text-sm text-gray-500">
        Internal platform admin — separate app, separate deploy, separate auth from the public
        frontend. Feature pages are built in a later stage.
      </p>
    </main>
  );
}
