import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// Socle d'AUTHENTIFICATION des routes d'upload de documents privés — partagé par les deux
// familles : /api/actor-document (+ /url) et /api/task-document (+ /url).
//
// Il existe pour une raison précise, deux fois constatée. La première : le gate et la
// résolution du document lié étaient recopiés verbatim dans les deux verbes de
// task-document, d'où une première factorisation DANS task-document/. La seconde, vue de
// plus haut : cette factorisation locale a laissé le socle en DEUX exemplaires dans le
// dépôt — task-document/authorize.ts et actor-document/route.ts — plus une troisième copie
// inlinée dans actor-document/url/route.ts. Trois définitions d'un gate, c'est trois
// endroits où se tromper, et un correctif appliqué à l'un laisse les autres ouverts en
// silence, sans qu'aucun test ne rougisse. Une seule définition, ici.
//
// Périmètre volontairement étroit : identifier l'appelant et fabriquer le client qui parle
// EN SON NOM. Rien de métier ne monte ici — les prédicats d'autorisation restent dans le
// `authorize.ts` de chaque famille (`user_can_write_crm_actor`, `user_can_write_crm_task`,
// `user_can_write_object_canonical`…), le traitement de fichier et les rollbacks dans
// chaque route. Ce qui est spécifique à une famille n'a rien à faire dans un module partagé :
// ce module ne doit jamais avoir à connaître la notion de tâche ou d'acteur.

/** Bucket privé UNIQUE des documents CRM (pièces jointes d'acteur ET de tâche : elles
 *  cohabitent dans le même bucket, sous des préfixes distincts `actors/` et `tasks/`).
 *  Voir `task-document/authorize.ts#resolveLinkedDocument` : rien d'autre que cette
 *  constante ne doit désigner un bucket pour signer ou supprimer côté tâche. */
export const PRIVATE_BUCKET = 'actor-documents';

/** Forme d'un identifiant UUID (acteur, tâche, document). Filtrer sur la FORME avant tout
 *  appel réseau évite d'envoyer au gate une valeur qui ne peut pas en être une. */
export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServerClient = NonNullable<ReturnType<typeof getServerSupabaseClient>>;

function bearer(req: NextRequest): string {
  const value = req.headers.get('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

/**
 * Client « en tant qu'appelant » : porte le JWT de session et la clé ANON, JAMAIS la
 * service key. C'est LUI, et lui seul, qui doit évaluer les prédicats d'autorisation —
 * le client service_role rendu par `authenticated` contourne RLS, une réponse obtenue
 * avec lui ne dirait rien des droits de l'appelant.
 *
 * Sert uniquement à appeler les RPC SECURITY DEFINER de gate : RLS bloque de toute façon
 * la lecture/écriture directe des tables CRM par ce client.
 */
export function callerClient(jwt: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export type AuthenticatedRequest =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      server: ServerClient;
      jwt: string;
      userId: string;
    };

/**
 * Identifie l'appelant : Bearer → `auth.getUser`. Rend le client service_role (`server`),
 * le JWT brut (`jwt`, à passer au gate de la famille) et l'`userId` (colonnes `created_by`).
 *
 * N'AUTORISE RIEN. Un appel qui s'arrête ici a seulement prouvé qu'un utilisateur existe :
 * `server` contourne RLS, s'en servir sans avoir évalué le prédicat de la famille ouvrirait
 * la table à tout compte authentifié. Le gate doit précéder toute lecture et toute écriture.
 *
 * La forme `{ ok: false; response }` plutôt qu'un throw ou un `null` est délibérée : elle
 * force chaque appelant à un `if (!auth.ok) return auth.response;` — le narrowing TypeScript
 * rend l'oubli du garde impossible à compiler, `auth.server` n'existant pas sur la branche
 * d'échec.
 */
export async function authenticated(req: NextRequest): Promise<AuthenticatedRequest> {
  const server = getServerSupabaseClient();
  if (!server) return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 500 }) };
  const jwt = bearer(req);
  if (!jwt) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const { data, error } = await server.auth.getUser(jwt);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  return { ok: true, server, jwt, userId: data.user.id };
}
