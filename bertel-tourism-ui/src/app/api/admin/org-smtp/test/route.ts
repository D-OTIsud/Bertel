import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { invalidateOrgSmtpConfig } from '@/lib/org-smtp.server';
import { safeSmtpError } from '@/lib/smtp-error';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * « Tester la connexion » du relais SMTP d'une ORG (18g). Ouvre une session vers le relais
 * ENREGISTRÉ et rend { ok, detail } ; l'issue est consignée en base pour l'admin suivant.
 *
 * DEUX invariants tiennent cette route :
 *
 * 1. L'autorisation est évaluée EN TANT QU'APPELANT, en appelant `api.get_org_smtp` sur son
 *    JWT : ce RPC est gaté (superadmin plateforme ou admin de rang ≥ 30 de CETTE ORG) et lève
 *    lui-même 42501. Rejouer la garde ici en dupliquerait la définition — et c'est la copie
 *    dupliquée qui se périme.
 *
 * 2. L'HÔTE N'EST JAMAIS LU DANS LE CORPS DE LA REQUÊTE. Seul `orgObjectId` y est accepté ; les
 *    paramètres de connexion sont relus en base en service_role. Accepter un hôte fourni par
 *    l'appelant transformerait ce bouton en moyen de faire ouvrir au VPS une connexion TCP vers
 *    la destination de son choix — et le CHECK de port qui borne le formulaire ne protégerait
 *    plus rien, puisqu'il ne s'applique qu'à ce qui est enregistré.
 *
 * Le mot de passe ne quitte jamais le serveur.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  let body: { orgObjectId?: unknown };
  try {
    body = (await req.json()) as { orgObjectId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }
  const orgObjectId = typeof body?.orgObjectId === 'string' ? body.orgObjectId.trim() : '';
  if (!orgObjectId) return NextResponse.json({ ok: false, error: 'missing_org' }, { status: 400 });

  // Autorisation EN TANT QU'APPELANT — le RPC gaté est la garde, pas une copie de sa règle.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: gateErr } = await asCaller.schema('api').rpc('get_org_smtp', { p_org_object_id: orgObjectId });
  if (gateErr) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  // Paramètres de connexion : relus EN BASE, jamais reçus de l'appelant.
  const { data, error } = await server.schema('api').rpc('get_org_smtp_secret', { p_org_object_id: orgObjectId });
  if (error) {
    console.error('[org-smtp/test] get_org_smtp_secret failed');
    return NextResponse.json({ ok: false, error: 'read_failed' }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : null) as
    | { host: string; port: number; secure: boolean; username: string | null; password: string | null }
    | null;
  if (!row) {
    // Pas de ligne, ou relais non activé : `get_org_smtp_secret` ne rend rien tant que
    // `is_enabled` est faux. Ce n'est pas une erreur — c'est l'état à afficher.
    return NextResponse.json(
      { ok: false, detail: 'Aucun relais actif : enregistrez la configuration et cochez « Activer l’envoi ».' },
      { status: 200 },
    );
  }

  const transport = nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure: row.secure === true,
    requireTLS: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
    ...(row.username && row.password ? { auth: { user: row.username, pass: row.password } } : {}),
  });

  let ok = false;
  let detail: string;
  try {
    await transport.verify();
    ok = true;
    detail = 'Connexion SMTP réussie. Aucun e-mail n’a été envoyé.';
  } catch (err) {
    detail = safeSmtpError(err);
  } finally {
    transport.close();
  }

  // Consigné en base pour que l'admin suivant voie le dernier résultat sans retester. Best-effort :
  // l'échec de la consignation ne doit pas transformer un test réussi en erreur.
  const { error: recErr } = await server
    .schema('api')
    .rpc('record_org_smtp_test', { p_org_object_id: orgObjectId, p_ok: ok, p_error: ok ? null : detail });
  if (recErr) console.error('[org-smtp/test] record_org_smtp_test failed');

  // La config a pu changer juste avant ce test : la mémorisation d'une minute ferait sinon
  // expédier le prochain envoi par l'ancien relais alors qu'on vient de valider le nouveau.
  invalidateOrgSmtpConfig(orgObjectId);

  return NextResponse.json({ ok, detail }, { status: 200 });
}
