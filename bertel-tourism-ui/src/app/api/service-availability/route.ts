import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { resolveSmtpConfig } from '@/lib/smtp-settings.server';

export const runtime = 'nodejs';
const unavailable = { translation: false, imageAnalysis: false, email: false };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Configuration presence only: never probes a provider or SMTP connection. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const jwt = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
  if (!jwt) return json(unavailable, 401);
  const server = getServerSupabaseClient();
  if (!server) return json(unavailable, 503);
  try {
    const { data, error } = await server.auth.getUser(jwt);
    if (error || !data?.user) return json(unavailable, 401);
  } catch {
    return json(unavailable, 503);
  }
  // A failed AI lookup must not disable a separately configured SMTP server.
  const [ai, smtp] = await Promise.allSettled([
    resolveActiveAiProvider(server, req.signal),
    resolveSmtpConfig(),
  ]);
  const aiAvailable = ai.status === 'fulfilled' && ai.value !== null;
  return json({
    translation: aiAvailable,
    imageAnalysis: aiAvailable,
    email: smtp.status === 'fulfilled' && smtp.value !== null,
  });
}
