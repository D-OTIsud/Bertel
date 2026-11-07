'use client';

import { Suspense } from 'react';
import { PortalHomePage } from '@/views/PortalHomePage';

export default function EspacePage() {
  return (
    <Suspense fallback={null}>
      <PortalHomePage />
    </Suspense>
  );
}
