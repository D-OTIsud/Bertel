import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeAdminRoute, sharesActiveOrg } from '../_authorize';

export const runtime = 'nodejs';

// Identité d'un MEMBRE, éditée par un administrateur (panneau Équipe).
//
// Les 4 gardes vivent ici et NULLE PART ailleurs côté client : l'écran désactive des contrôles
// pour rendre l'état lisible, il ne garde rien. L'écriture ci-dessous tourne en service-role
// (bypass RLS), donc les sondes "en tant qu'appelant" SONT la frontière (même modèle que §59).

const PATCH_FIELDS = new Set(['userId', 'displayName', 'email', 'platformRole']);
const PLATFORM_ROLES = new Set(['tourism_agent', 'super_admin', 'owner']);
/** Rôles qu'en base SEUL un owner peut attribuer (trigger api.enforce_app_user_profile_role_change). */
const PRIVILEGED_ROLES = new Set(['super_admin', 'owner']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface TargetProfile { display_name: string | null; avatar_url: string | null; role: string | null }

/**
 * Rang d'administration ORG actif de la CIBLE (`null` si elle n'a aucun rôle admin actif).
 *
 * Correctif revue finale (bloquant) : cette route était la SEULE surface d'administration
 * d'équipe qui ne comparait aucun rang — un admin d'ORG de rang 30 pouvait réécrire l'identité
 * (nom, e-mail, rôle plateforme) d'un administrateur d'ORG de rang 50. Même prédicat que
 * RANK_VIOLATION côté SQL (rls_policies.sql : rpc_set_admin_role / rpc_set_business_role /
 * rpc_revoke_admin_role, §2.6) : gestion vers le bas SEULEMENT, superuser exempté — appliqué ici
 * par l'appelant (voir le `if (!auth.isSuper …)` au site d'appel).
 *
 * Un seul aller-retour (embed PostgREST à deux niveaux) : « un seul membership actif par
 * utilisateur » est la doctrine MVP de ce projet, donc pas besoin de désambiguïser par ORG comme
 * le fait la RPC (dont le rang cible est scopé à l'ORG précise de la ligne `user_org_membership`
 * modifiée).
 */
async function resolveTargetAdminRank(
  server: SupabaseClient,
  targetUserId: string,
): Promise<{ rank: number | null } | { error: string }> {
  const { data, error } = await server
    .from('user_org_membership')
    .select('user_org_admin_role(is_active, ref_org_admin_role(rank))')
    .eq('user_id', targetUserId)
    .eq('is_active', true);
  if (error) return { error: error.message };
  type Row = {
    user_org_admin_role: Array<{ is_active: boolean; ref_org_admin_role: { rank: number } | null }> | null;
  };
  // `server` n'est pas typé contre un schéma généré (`SupabaseClient` nu) : l'inférence structurelle
  // de `.select()` sur une chaîne littérale devine `ref_org_admin_role` en TABLEAU (relation
  // to-many par défaut, faute de connaître la FK réelle). En réalité `user_org_admin_role.role_id`
  // référence `ref_org_admin_role.id` (many-to-one) : PostgREST rend un objet unique à l'exécution.
  // D'où le passage par `unknown` — c'est un désaccord de TYPAGE, pas de comportement runtime.
  const activeRole = ((data ?? []) as unknown as Row[])
    .flatMap((row) => row.user_org_admin_role ?? [])
    .find((r) => r.is_active);
  return { rank: activeRole?.ref_org_admin_role?.rank ?? null };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  const userId = (new URL(req.url).searchParams.get('userId') ?? '').trim();
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  const { data: authUser, error: authErr } = await server.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  const { data: profile, error: profileErr } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();
  // Même raisonnement que le PATCH (garde profile_read_failed) : un incident de lecture ne doit
  // pas se travestir en "profil vide" aux yeux de l'admin qui consulte l'écran.
  if (profileErr) {
    return NextResponse.json({ error: 'profile_read_failed', detail: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    email: authUser.user.email ?? null,
    platformRole: profile?.role ?? null,
    lastSignInAt: authUser.user.last_sign_in_at ?? null,
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminRoute(req);
  if (!auth.ok) return auth.response;
  const { server } = auth;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    // `null` est un JSON valide (donc hors du catch) mais `Object.keys(null)` lève — sans cette
    // garde le 500 qui en résulte contredirait le try/catch juste au-dessus, censé couvrir tout
    // corps mal formé. Un tableau n'est pas non plus l'objet à plat attendu par PATCH_FIELDS.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // Une clé inconnue FAIT ÉCHOUER l'appel : une valeur jetée en silence est un piège d'écriture.
  const unknown = Object.keys(body).find((k) => !PATCH_FIELDS.has(k));
  if (unknown) return NextResponse.json({ error: 'unknown_field', detail: unknown }, { status: 422 });

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'invalid_user_id' }, { status: 422 });

  // Anti-self : un owner qui se rétrograde se verrouille dehors, et son identité a déjà sa
  // surface (Paramètres → Mon compte). Comparaison insensible à la casse : PostgreSQL normalise
  // les uuid, un `userId` reçu en majuscules ne doit pas passer la garde.
  if (userId.toLowerCase() === auth.callerId.toLowerCase()) {
    return NextResponse.json({ error: 'self_edit_forbidden' }, { status: 403 });
  }
  if (!auth.isSuper && !(await sharesActiveOrg(server, auth.callerId, userId))) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 });
  }

  // Volet rang d'ORG (revue finale, correctif bloquant) — voir resolveTargetAdminRank ci-dessus.
  // Gate TOUT PATCH (nom, e-mail, rôle plateforme), pas seulement les champs sensibles : la faille
  // était qu'un rang 30 pouvait réécrire l'identité d'un rang 50 par un simple renommage.
  if (!auth.isSuper) {
    const targetRank = await resolveTargetAdminRank(server, userId);
    // Lecture dont dépend une garde : un échec doit REFUSER, jamais continuer comme si la cible
    // n'avait aucun rang admin (ce qui rendrait la garde fail-open).
    if ('error' in targetRank) {
      return NextResponse.json({ error: 'target_rank_check_failed', detail: targetRank.error }, { status: 500 });
    }
    if (targetRank.rank !== null && targetRank.rank >= auth.rank) {
      return NextResponse.json(
        {
          error: 'rank_violation',
          detail: `Rang d'administration de la cible (${targetRank.rank}) supérieur ou égal au vôtre (${auth.rank}).`,
        },
        { status: 403 },
      );
    }
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  const platformRole = typeof body.platformRole === 'string' ? body.platformRole.trim() : undefined;

  if (email !== undefined && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  }
  if (platformRole !== undefined && !PLATFORM_ROLES.has(platformRole)) {
    return NextResponse.json({ error: 'invalid_platform_role' }, { status: 422 });
  }

  // Le GET vérifie l'existence du compte auth ; le PATCH doit le faire aussi, et AVANT toute
  // écriture — sinon un userId inexistant sort en 500 (échec de l'upsert plus bas), qui ment
  // sur la cause.
  const { data: authTarget, error: authTargetErr } = await server.auth.admin.getUserById(userId);
  if (authTargetErr || !authTarget?.user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  // Une adresse identique à celle du compte n'est PAS un changement : ni la garde acteur ni
  // l'écriture GoTrue n'ont lieu d'être. Un formulaire complet renvoie souvent le champ inchangé.
  const currentEmail = (authTarget.user.email ?? '').trim().toLowerCase();
  const emailChanged = email !== undefined && email !== currentEmail;

  const { data: profile, error: profileErr } = await server
    .from('app_user_profile')
    .select('display_name, avatar_url, role')
    .eq('id', userId)
    .maybeSingle<TargetProfile>();
  // L'erreur n'est PAS ignorable : `profile` vaudrait null, la garde owner_required ci-dessous
  // conclurait « la cible n'a aucun rôle privilégié » et ne sonderait pas — un admin de rang 30
  // destituerait un owner par un simple incident de lecture. Fail-closed. `maybeSingle()` rend
  // `{ data: null, error: null }` quand la ligne n'existe pas (compte invité) : ce cas-là reste
  // légitime et ne doit PAS échouer.
  if (profileErr) {
    return NextResponse.json({ error: 'profile_read_failed', detail: profileErr.message }, { status: 500 });
  }

  // Garde n° 4 — reflète le trigger api.enforce_app_user_profile_role_change côté DB (que
  // l'écriture service-role ci-dessous NEUTRALISE : le trigger traite service_role comme un owner
  // et sort d'emblée sans JWT). PAS une transcription littérale : le trigger reconnaît AUSSI
  // `raw_user_meta_data->>'role' = 'admin'` comme owner, ce que cette route ne reconnaît pas — la
  // route est donc STRICTEMENT plus stricte que le trigger, et c'est voulu (un admin par métadonnée
  // ne doit pas suffire à distribuer le rang plateforme depuis l'API). Sans cette sonde, un
  // super_admin ou un admin de rang 30 distribuerait le rang plateforme. Le sens compte dans les
  // DEUX directions : retirer 'owner'/'super_admin' à quelqu'un est aussi privilégié que le lui
  // donner.
  const touchesPrivilegedRole =
    platformRole !== undefined &&
    platformRole !== (profile?.role ?? null) &&
    (PRIVILEGED_ROLES.has(platformRole) || PRIVILEGED_ROLES.has(profile?.role ?? ''));

  // CRITIQUE (revue finale) — changer l'e-mail de connexion d'un owner/super_admin, c'est PRENDRE
  // son compte : le lien « Mot de passe oublié ? » (ou la réinitialisation envoyée depuis la
  // modale) atterrit alors à la NOUVELLE adresse. La garde ci-dessus ne protège QUE le champ
  // platformRole ; sans celle-ci, un admin d'ORG de rang 30 pose l'e-mail de connexion d'un owner
  // sur une adresse qu'il contrôle, sans jamais toucher platformRole.
  const touchesPrivilegedEmail = emailChanged && PRIVILEGED_ROLES.has(profile?.role ?? '');

  if (touchesPrivilegedRole || touchesPrivilegedEmail) {
    // Sondée AU PLUS UNE FOIS par requête, même quand les deux gardes ci-dessus sont concernées
    // dans le même appel — la sonde coûte un aller-retour.
    const { data: isOwner } = await auth.asCaller.schema('api').rpc('is_platform_owner');
    if (isOwner !== true) {
      if (touchesPrivilegedRole) {
        return NextResponse.json(
          { error: 'owner_required', detail: 'Seul un owner peut attribuer ou retirer le rang plateforme.' },
          { status: 403 },
        );
      }
      return NextResponse.json(
        {
          error: 'owner_required_for_email',
          detail:
            "Ce compte a un rang plateforme privilégié (owner ou super administrateur) : seul un owner de la plateforme peut changer son adresse de connexion.",
        },
        { status: 403 },
      );
    }
  }

  // `email !== undefined` est redondant avec `emailChanged` (qui l'implique déjà) mais préserve
  // le rétrécissement de type TypeScript sur `email` dans ce bloc — `emailChanged` est un simple
  // booléen, il ne porte pas l'information de type jusqu'ici.
  if (email !== undefined && emailChanged && !auth.isSuper) {
    // Poser sur un compte l'adresse d'un canal acteur lui donne la propriété des fiches de cet
    // acteur (api.user_actor_ids → api.is_object_owner), y compris hors de l'ORG de l'appelant.
    // Le rattachement est parfois légitime (c'est ainsi qu'un vrai prestataire devient propriétaire
    // de sa fiche), mais c'est une attribution de droits : réservé au superuser plateforme.
    // `ilike` interprète `_`/`%` comme des jokers SQL : sans échappement, une adresse comme
    // `jean_dupont@oti.re` matcherait `jeanXdupont@...` pour n'importe quel X et produirait un
    // 403 fantôme. Pas de filtre sur le type de canal : délibérément sur-inclusif (fail-closed).
    const escapedEmail = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: claimed, error: claimedErr } = await server
      .from('actor_channel')
      .select('id')
      .ilike('value', escapedEmail)
      .limit(1);
    if (claimedErr) {
      return NextResponse.json({ error: 'actor_check_failed', detail: claimedErr.message }, { status: 500 });
    }
    if (claimed && claimed.length > 0) {
      return NextResponse.json(
        {
          error: 'email_claims_actor',
          detail:
            'Cette adresse est celle d’un prestataire : la poser sur ce compte lui donnerait la propriété de ses fiches. Réservé à un superuser plateforme.',
        },
        { status: 403 },
      );
    }
  }

  if (email !== undefined && emailChanged) {
    // email_confirm: true ⇒ changement IMMÉDIAT, pas de courriel de confirmation. L'e-mail est
    // aussi ce que api.is_object_owner compare à actor_channel : changer l'adresse peut changer
    // les fiches que ce membre possède. La modale l'annonce à l'utilisateur.
    const { error: mailErr } = await server.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (mailErr) {
      // La faute de frappe la plus banale de cet écran : une adresse déjà prise par un autre
      // compte ne doit pas sortir en 500 (qui laisse croire à un incident serveur).
      const taken = /already|exists|registered|duplicate/i.test(mailErr.message);
      return NextResponse.json(
        { error: taken ? 'email_taken' : 'email_update_failed', detail: mailErr.message },
        { status: taken ? 409 : 500 },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (displayName !== undefined) patch.display_name = displayName;
  if (platformRole !== undefined) patch.role = platformRole;
  if (Object.keys(patch).length > 0) {
    // upsert : un compte invité peut ne pas encore avoir de ligne de profil applicatif.
    const { error: profErr } = await server
      .from('app_user_profile')
      .upsert({ id: userId, ...patch }, { onConflict: 'id' });
    if (profErr) {
      // Écriture partielle : si l'e-mail a déjà été changé dans ce même appel, l'adresse de
      // connexion a bougé même si le reste échoue — la réponse doit le dire.
      const detail = emailChanged
        ? `${profErr.message} (l’adresse de connexion a déjà été changée dans cet appel)`
        : profErr.message;
      return NextResponse.json({ error: 'profile_update_failed', detail }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: true }, { status: 200 });
}
