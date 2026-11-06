import { type NextRequest } from 'next/server';
import { handleThesaurusRequest } from '@/lib/thesaurus-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stable authenticated concept URI; resolves against the currently activated release. */
export async function GET(req: NextRequest, context: { params: Promise<{ conceptId: string }> }) {
  return handleThesaurusRequest(req, { action: 'resolve', ...(await context.params) });
}
