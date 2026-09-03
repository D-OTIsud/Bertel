import { NextResponse, type NextRequest } from 'next/server';
import { UUID_SHAPE, authenticated, callerClient, type ServerClient } from '../../_document-auth';

export const runtime = 'nodejs';

// Accès portail d'un acteur (18a/D1) — géré depuis la fiche prestataire CRM, PAS depuis
// l'administration d'équipe : le gate est `api.user_can_write_crm_actor` (évalué EN TANT
// QUE L'APPELANT), pas le rang plateforme. Le client service_role ne sert QU'APRÈS ce gate.
//
// CETTE ROUTE EST UNE SURFACE DE PRIVILÈGE. `middleware.ts` ne couvre que `/api/public/*`
// et aucune route sous `src/app` n'est protégée par rôle côté serveur : rien, en amont, ne
// vérifie qui appelle. Le fait que le bloc « Accès portail » ne s'affiche qu'aux agents
// n'est PAS une barrière — un écran n'en est jamais une. La garde est donc entièrement ici,
// et elle porte sur CET acteur précis, pas sur « être authentifié ».
//
// Invariants :
//  - l'e-mail invité DOIT être un canal `email` de CET acteur ;
//  - on n'écrase JAMAIS un compte existant qui n'est pas {role:'actor', actor_id: CET
//    acteur} — un compte de l'office dont l'e-mail traîne dans `actor_channel` reste
//    intouchable (409), y compris sur la branche `resend` qui SUPPRIME avant de ré-inviter ;
//  - `revoke` ne supprime QUE ce même profil exact (garde anti-suppression de staff).
//
// Ne se marche pas sur les pieds avec `api.rpc_gdpr_erase_subject` (18a §8) : l'effacement
// RGPD met `app_user_profile.actor_id` à NULL et REMONTE l'id du compte à l'opérateur, qui
// le supprime via l'API Admin. Après un effacement, cette route ne voit donc plus aucun
// profil lié à l'acteur — elle rend 409 `no_portal_account` au lieu de re-supprimer.

type Body = { action?: unknown; actorId?: unknown; email?: unknown };

const ACTIONS: readonly string[] = ['status', 'invite', 'resend', 'revoke'];

/** Même forme d'adresse que la route d'invitation d'équipe (§164) — un seul vocabulaire. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Profil rattaché à l'acteur, tel que lu en base. */
type LinkedProfile = { id: string; role: string | null };

/**
 * Adresses `email` déclarées dans les coordonnées de CET acteur, normalisées.
 *
 * C'est le premier des deux verrous de l'invitation : on ne peut inviter qu'une adresse que
 * l'office a déjà consignée pour cette personne. Un kind `email` absent du référentiel rend
 * une liste vide — donc un refus, jamais un « on ne sait pas, on laisse passer ».
 */
async function actorEmailChannels(server: ServerClient, actorId: string): Promise<string[]> {
  const { data: kind } = await server
    .from('ref_code_contact_kind')
    .select('id')
    .eq('code', 'email')
    .limit(1)
    .maybeSingle();
  const kindId = (kind as { id?: string } | null)?.id;
  if (!kindId) return [];
  const { data } = await server.from('actor_channel').select('value').eq('actor_id', actorId).eq('kind_id', kindId);
  return ((data ?? []) as Array<{ value?: unknown }>)
    .map((row) => String(row.value ?? '').trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const { server, jwt } = auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const actorId = typeof body.actorId === 'string' ? body.actorId : '';
  // Filtrer sur la FORME avant tout appel réseau : une valeur qui ne peut pas être un UUID
  // n'a rien à faire au gate.
  if (!UUID_SHAPE.test(actorId)) return NextResponse.json({ error: 'invalid_actor' }, { status: 422 });
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'invalid_action' }, { status: 422 });

  // LE gate — évalué EN TANT QUE L'APPELANT (clé anon + son JWT), jamais avec la service
  // key : une réponse obtenue avec celle-ci ne dirait rien des droits de l'appelant.
  // FAIL-CLOSED : `user_can_write_crm_actor` n'a pas de COALESCE et peut rendre NULL —
  // seule la valeur `true` autorise.
  const { data: canWrite, error: gateErr } = await callerClient(jwt)
    .schema('api')
    .rpc('user_can_write_crm_actor', { p_actor_id: actorId });
  if (gateErr || canWrite !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Le profil éventuellement rattaché à CET acteur (index unique partiel
  // `uq_app_user_profile_actor_id` : au plus un). Seul un profil `role='actor'` est un
  // compte PORTAIL ; tout autre rôle est une anomalie qu'on signale au lieu de l'écraser.
  const { data: linkedRow } = await server
    .from('app_user_profile')
    .select('id, role')
    .eq('actor_id', actorId)
    .limit(1)
    .maybeSingle();
  const linked = (linkedRow as LinkedProfile | null) ?? null;
  const portal = linked && linked.role === 'actor' ? linked : null;
  const linkedToOtherAccount = linked !== null && portal === null;

  if (action === 'status') {
    if (!portal) return NextResponse.json({ account: null, linkedToOtherAccount });
    const { data: user } = await server.auth.admin.getUserById(portal.id);
    return NextResponse.json({
      account: {
        userId: portal.id,
        email: user?.user?.email ?? null,
        invitedAt: user?.user?.created_at ?? null,
        lastSignInAt: user?.user?.last_sign_in_at ?? null,
      },
      linkedToOtherAccount,
    });
  }

  if (action === 'revoke') {
    // Ne supprime QUE le compte portail de CET acteur. Un profil d'une autre nature
    // rattaché ici (anomalie) n'est pas une cible : on refuse plutôt que de supprimer.
    if (!portal) return NextResponse.json({ error: 'no_portal_account' }, { status: 409 });
    const { error: delErr } = await server.auth.admin.deleteUser(portal.id);
    if (delErr) return NextResponse.json({ error: 'revoke_failed', detail: delErr.message }, { status: 500 });
    // `app_user_profile.id` est ON DELETE CASCADE sur auth.users : le lien tombe avec le compte.
    return NextResponse.json({ revoked: true });
  }

  // invite / resend
  if (linkedToOtherAccount) {
    // L'index unique refuserait de toute façon un second profil sur cet acteur : mieux vaut
    // le dire ici que laisser l'invitation créer un compte, échouer à l'écriture du profil,
    // et se faire annuler par le rollback.
    return NextResponse.json({ error: 'actor_already_linked' }, { status: 409 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_SHAPE.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  const channels = await actorEmailChannels(server, actorId);
  if (!channels.includes(email)) {
    return NextResponse.json({ error: 'email_not_actor_channel' }, { status: 422 });
  }

  // Un compte existe déjà avec cet e-mail ? Il n'est ré-invitable QUE s'il est LE compte
  // portail de CET acteur ET ne s'est jamais connecté (même règle que la route d'équipe).
  // perPage borné : correct à l'échelle actuelle, à revoir si la base de comptes dépasse ~1000.
  const { data: list } = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((user) => user.email?.toLowerCase() === email);
  if (existing) {
    // La garde qui protège les comptes de l'office : un e-mail d'agent peut parfaitement
    // figurer dans `actor_channel` (il a répondu pour le compte du partenaire, l'adresse a
    // été consignée). Sans ce refus, `resend` SUPPRIMERAIT son compte.
    if (portal?.id !== existing.id) {
      return NextResponse.json({ error: 'email_taken_by_staff' }, { status: 409 });
    }
    if (action !== 'resend') {
      return NextResponse.json({ error: 'already_invited' }, { status: 409 });
    }
    if (existing.last_sign_in_at) {
      return NextResponse.json({ error: 'already_active' }, { status: 409 });
    }
    // GoTrue refuse `inviteUserByEmail` sur une adresse existante : on supprime puis
    // ré-invite. Rien à perdre — le compte ne s'est jamais connecté.
    const { error: delErr } = await server.auth.admin.deleteUser(existing.id);
    if (delErr) return NextResponse.json({ error: 'resend_failed', detail: delErr.message }, { status: 500 });
  }

  const origin = (req.headers.get('origin') ?? new URL(req.url).origin).replace(/\/$/, '');
  const { data: created, error: createErr } = await server.auth.admin.inviteUserByEmail(email, {
    // `?espace=1` : /set-password bascule alors sur la copie destinée au PARTENAIRE
    // (SetPasswordPage: `searchParams.get('espace') === '1'`). Sans ce paramètre, la
    // personne invitée lit la copie écrite pour le personnel de l'office.
    // ⚠ L'allowlist Auth → URL Configuration doit accepter la query string (motif
    // `…/set-password*`), sinon Supabase retombe sur le Site URL et le paramètre est perdu.
    redirectTo: `${origin}/set-password?espace=1`,
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ error: 'create_failed', detail: createErr?.message ?? 'no_user' }, { status: 500 });
  }
  // Le profil PORTAIL : rôle `actor` + le lien explicite. C'est CE couple qui confine le
  // compte (routage front) et fonde sa portée (RLS via api.current_user_actor_id).
  const { error: upsertErr } = await server
    .from('app_user_profile')
    .upsert({ id: created.user.id, role: 'actor', actor_id: actorId }, { onConflict: 'id' });
  if (upsertErr) {
    // Compte auth créé mais profil raté ⇒ rollback, sinon le compte reste sans rôle : il
    // se connecterait sans périmètre, ce que le front lit comme une session cassée.
    await server.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: 'profile_failed', detail: upsertErr.message }, { status: 500 });
  }
  return NextResponse.json({ userId: created.user.id }, { status: 201 });
}
