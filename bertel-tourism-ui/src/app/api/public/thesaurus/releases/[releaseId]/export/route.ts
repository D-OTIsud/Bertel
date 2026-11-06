import { type NextRequest } from 'next/server';
import { handleThesaurusRequest } from '@/lib/thesaurus-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  return handleThesaurusRequest(req, { action: 'export', ...(await context.params) });
}
