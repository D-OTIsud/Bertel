'use client';

import { Suspense } from 'react';
import HelpPage from '@/views/HelpPage';

// useSearchParams exige une frontière Suspense côté App Router.
export default function AidePage() {
  return (
    <Suspense fallback={null}>
      <HelpPage />
    </Suspense>
  );
}
