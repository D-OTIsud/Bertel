import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

/** Transition/return artifact: manual sending cannot be reopened by configuration.
 * No Auth, SQL, body parsing, SMTP or provider dependency belongs to this handler. */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json({ error: 'email_protection_unavailable' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
