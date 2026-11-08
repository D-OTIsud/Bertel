import type { PostgrestError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import { engineErrorDetail } from '@/lib/db-error-message';
import { routeFailure } from './_route-failure';

export function unlinkDocumentResponse(route: string, outcome: unknown, error: PostgrestError | null): NextResponse {
  if (error) {
    return routeFailure(route, 'delete_failed', {
      detail: engineErrorDetail(error, { operation: 'delete', logUnknown: false }),
    });
  }

  switch (outcome) {
    case 'deleted':
      return NextResponse.json({ deleted: true });
    case 'forbidden':
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    case 'not_found':
    case 'file_missing':
      return NextResponse.json({ error: outcome }, { status: 404 });
    case 'unexpected_bucket':
      return NextResponse.json({ error: outcome }, { status: 409 });
    case 'promoted_document':
      return NextResponse.json({
        error: outcome,
        detail: 'Un document transféré reste dans l’historique.',
      }, { status: 409 });
    case 'portal_photo':
      return NextResponse.json({ error: 'delete_failed' }, { status: 409 });
    default:
      return routeFailure(route, 'delete_failed');
  }
}
