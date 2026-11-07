import type { NextRequest, NextResponse } from 'next/server';
import { verifySmtpConnection } from '@/lib/mail.server';
import { authorizeSmtpAdmin, smtpJson } from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeSmtpAdmin(req);
  if (!auth.ok) return auth.response;
  try { return smtpJson(await verifySmtpConnection()); }
  catch { return smtpJson({ ok: false, detail: 'La configuration SMTP est indisponible. Aucun e-mail n’a été envoyé.' }, 503); }
}
