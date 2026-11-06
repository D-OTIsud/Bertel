import { type NextRequest } from 'next/server';
import { handleThesaurusRequest } from '@/lib/thesaurus-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  return handleThesaurusRequest(req, { action: 'manifest' });
}
