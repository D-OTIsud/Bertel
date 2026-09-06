import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store, private' };
const attempts = new Map<string, { count: number; until: number }>();
let queue: Promise<unknown> = Promise.resolve();

function limited(req: NextRequest): boolean {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const key = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const previous = attempts.get(key);
  if (previous) return ++previous.count > 20;
  if (attempts.size >= 2000) return true;
  attempts.set(key, { count: 1, until: now + 60_000 });
  return false;
}

async function issueSession() {
  const server = getServerSupabaseClient();
  if (!server) throw new Error('unavailable');
  let identity = await server.schema('api').rpc('get_sandbox_discovery_user');
  if (identity.error) throw new Error('sandbox_not_ready');
  if (!identity.data) {
    // Un seul compte découverte partagé, créé sans e-mail d’invitation.
    // Le RPC fixe l’organisation et les droits avant toute émission de session.
    const created = await server.auth.admin.createUser({
      email: `discovery-${createHash('sha256').update(`bertel-discovery:${process.env.SUPABASE_SERVICE_ROLE_KEY}`).digest('hex').slice(0, 24)}@sandbox.bertel.invalid`,
      email_confirm: true,
      app_metadata: { sandbox_discovery: true },
    });
    // NULL permet de reprendre une création interrompue après Auth : seul un
    // compte marqué par l’API Admin peut être retrouvé et préparé par ce RPC.
    const provision = await server.schema('api').rpc('configure_sandbox_discovery_user', { p_user_id: created.data.user?.id ?? null });
    if (provision.error) throw new Error('provision_failed');
    identity = await server.schema('api').rpc('get_sandbox_discovery_user');
    if (identity.error || !identity.data) throw new Error('sandbox_not_ready');
  }
  const { data, error } = await server.auth.admin.getUserById(identity.data as string);
  if (error || !data.user?.email || data.user.app_metadata?.sandbox_discovery !== true) throw new Error('invalid_identity');

  // Le client qui consomme le lien utilise la clé publique. Ne jamais connecter
  // le singleton service_role à un compte utilisateur (cela remplacerait son JWT).
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const link = await server.auth.admin.generateLink({ type: 'magiclink', email: data.user.email });
    if (link.error || link.data.user?.id !== identity.data || !link.data.properties?.hashed_token) throw new Error('link_failed');
    const verified = await auth.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
    const session = verified.data.session;
    if (!verified.error && session && session.user.id === identity.data && session.user.app_metadata?.sandbox_discovery === true) {
      return { access_token: session.access_token, refresh_token: session.refresh_token };
    }
  }
  throw new Error('session_failed');
}

export async function POST(req: NextRequest) {
  if (limited(req)) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  // Sérialise création et consommation des liens pour le compte partagé. Le retry
  // couvre également une émission concurrente par un autre processus serveur.
  const issuing = queue.then(issueSession);
  queue = issuing.catch(() => undefined);
  try {
    return NextResponse.json(await issuing, { headers });
  } catch {
    // Aucun token, détail Auth ni adresse technique dans les erreurs publiques.
    return NextResponse.json({ error: 'sandbox_unavailable' }, { status: 503, headers });
  }
}
