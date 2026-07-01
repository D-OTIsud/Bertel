'use client';

import { useParams } from 'next/navigation';
import ListComposeView from '@/views/ListComposeView';

export default function ListComposePage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  return <ListComposeView listId={id} />;
}
