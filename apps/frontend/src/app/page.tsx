import type { ReactNode } from 'react';

export default function HomePage(): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">BeautyBook</h1>
      <p className="text-sm text-gray-500">
        Project scaffold — infrastructure stage. Feature pages are built in later stages.
      </p>
    </main>
  );
}
