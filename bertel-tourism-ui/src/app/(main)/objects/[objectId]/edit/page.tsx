'use client';

import { use } from 'react';
import { ObjectEditPage } from '@/features/object-editor/ObjectEditPage';

export default function ObjectEditRoute({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = use(params);
  return <ObjectEditPage objectId={objectId} />;
}
