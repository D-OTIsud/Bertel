'use client';

import { Suspense } from 'react';
import HelpPage from '@/views/HelpPage';
import { PageSkeleton } from '../../../components/common/PageSkeleton';

// useSearchParams exige une frontière Suspense côté App Router.
export default function AidePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <HelpPage />
    </Suspense>
  );
}
