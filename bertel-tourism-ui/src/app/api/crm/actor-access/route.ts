import { NextResponse, type NextRequest } from 'next/server';
import { UUID_SHAPE, authenticated, callerClient, type ServerClient } from '../../_document-auth';

export const runtime = 'nodejs';

// Accès portail d'un acteur (18a/D1) — géré depuis la fiche prestataire CRM, PAS depuis
// l'administration d'équipe : le gate est `api.user_can_*_crm_actor` (évalué EN TANT QUE
// L'APPELANT), pas le rang plateforme. Le client service_role ne sert QU'APRÈS ce gate.
//
// CETTE ROUTE EST UNE SURFACE DE PRIVILÈGE. `middleware.ts` ne couvre que `/api/public/*`
// et aucune route sous `src/app` n'est protégée par rôle côté serveur : rien, en amont, ne
// vérifie qui appelle. Le fait que le bloc « Accès portail » ne s'affiche qu'aux agents
// n'est PAS une barrière — un écran n'en est jamais une. La garde est donc entièrement ici,
// et elle porte sur CET acteur précis, pas sur « être authentifié ».
//
// Invariants :
//  - l'e-mail invité DOIT être un canal `email` de CET acteur ;
//  - `deleteUser` n'est JAMAIS appelé sur un compte résolu par son e-mail : la seule cible
//    supprimable est `portal.id`, c'est-à-dire le profil {role:'actor', actor_id: CET
//    acteur}. Un compte de l'office dont l'e-mail traîne dans `actor_channel` est donc
//    structurellement hors d'atteinte, y compris sur la branche `resend` ;
//  - on ne crée jamais un second compte pour un acteur qui en a déjà un — le refus est
//    rendu AVANT `inviteUserByEmail`, parce qu'après, l'e-mail est parti.
//
// Ne se marche pas sur les pieds avec `api.rpc_gdpr_erase_subject` (18a §8) : l'effacement
// RGPD met `app_user_profile.actor_id` à NULL et REMONTE l'id du compte à l'opérateur, qui
// le supprime via l'API Admin. Après un effacement, cette route ne voit donc plus aucun
// profil lié à l'acteur — elle rend 409 `no_portal_account` au lieu de re-supprimer.

type Body = { action?: unknown; actorId?: unknown; email?: unknown };

type Action = 'status' | 'invite' | 'resend' | 'revoke';
const ACTIONS: readonly string[] = ['status', 'invite', 'resend', 'revoke'];

/**
 * Le prédicat exigé PAR VERBE.
 *
 * `status` ne lit rien d'autre que l'existence d'un compte : l'exiger en ÉCRITURE rendait
 * la carte inutilisable pour toute une classe d'agents. `canWrite` côté front vient de
 * `api.current_user_can_write_crm_notes()` = superuser OU permission, tandis que le gate
 * d'écriture est superuser OU (périmètre ET permission) : un agent en lecture seule voyait
 * donc `status` répondre 403 sur CHAQUE fiche, et la carte afficher un bandeau d'alerte
 * permanent au lieu de son état « lecture seule ». La lecture suffit ici, et elle est déjà
 * la condition d'affichage de la fiche elle-même (`api.list_actor_crm`).
 *
 * Même asymétrie assumée que `actor-document/authorize.ts` : consulter n'est pas modifier.
 */
const REQUIRED_GATE: Record<Action, 'user_can_read_crm_actor' | 'user_can_write_crm_actor'> = {
  status: 'user_can_read_crm_actor',
  invite: 'user_can_write_crm_actor',
  resend: 'user_can_write_crm_actor',
  revoke: 'user_can_write_crm_actor',
};

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
 *
 * ⚠ Le `.eq('actor_id', actorId)` n'est pas décoratif : sans lui, l'adresse de N'IMPORTE
 * QUEL acteur passerait le verrou. Les arguments réels sont assertés par le test.
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

/**
 * Origine des liens d'invitation.
 *
 * ⚠ PAS l'en-tête `Origin`, contrairement à `admin/invite/route.ts` : §164 réservait ce
 * geste au rang plateforme, ici la population est « qui a `write_crm_notes` sur cet
 * acteur ». Un appelant qui pose `Origin: https://attaquant.example` ferait émettre une
 * invitation dont le lien porte le jeton vers son propre hôte, et la seule défense serait
 * l'allowlist Auth du dashboard — une configuration que ce code ne contrôle pas.
 *
 * `NEXT_PUBLIC_APP_URL` est la variable serveur déjà utilisée par `crm/notify-drain` et
 * `lists/send` pour fabriquer des liens : pas un nouveau bouton de déploiement. Repli sur
 * l'origine de la requête (`Host`, normalement réécrit par le proxy), jamais sur un en-tête
 * que l'appelant choisit librement.
 */
function inviteOrigin(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  return (configured || new URL(req.url).origin).replace(/\/$/, '');
}

/**
 * Trace CRM du geste — l'accès portail s'ouvre et se ferme sans laisser d'autre trace.
 *
 * Le périmètre CRM est PARTAGÉ : sur un acteur rattaché aux objets de deux offices, l'agent
 * de l'office A peut révoquer l'accès ouvert par l'office B. Sans cette ligne, le partenaire
 * perd son compte et rien ne dit qui l'a fait ni quand.
 *
 * Passe par `api.save_crm_interaction` EN TANT QUE L'APPELANT : `owner` reçoit son
 * `auth.uid()` (une écriture service_role l'aurait laissé à NULL, donc « Système »), et le
 * RPC revalide `user_can_write_crm_actor`. Sans `object_id` ni `topic_code`, la ligne naît
 * « note interne traitée » — c'est bien ce qu'elle est.
 *
 * L'échec est AVALÉ et rapporté par `traced: false` : le compte, lui, est déjà créé ou
 * supprimé — faire échouer la réponse mentirait sur ce qui s'est passé.
 */
async function trace(jwt: string, actorId: string, subject: string, body: string): Promise<boolean> {
  try {
    const { error } = await callerClient(jwt)
      .schema('api')
      .rpc('save_crm_interaction', { p_payload: { actor_id: actorId, subject, body } });
    return !error;
  } catch {
    return false;
  }
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
  // FAIL-CLOSED : les prédicats n'ont pas de COALESCE et peuvent rendre NULL hors contexte
  // HTTP — seule la valeur `true` autorise.
  //
  // ⚠ CE POINT COUVRE LES QUATRE VERBES, et c'est pour ça qu'il précède l'aiguillage. Le
  // déplacer après le bloc `status`/`revoke` ouvrirait la suppression de compte à tout
  // compte authentifié — une régression que les tests ferment verbe par verbe.
  const { data: canAct, error: gateErr } = await callerClient(jwt)
    .schema('api')
    .rpc(REQUIRED_GATE[action as Action], { p_actor_id: actorId });
  if (gateErr || canAct !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Le profil éventuellement rattaché à CET acteur (index unique partiel
  // `uq_app_user_profile_actor_id` : au plus un). Seul un profil `role='actor'` est un
  // compte PORTAIL ; tout autre rôle est une anomalie qu'on signale au lieu de l'écraser.
  const { data: linkedRow, error: linkedErr } = await server
    .from('app_user_profile')
    .select('id, role')
    .eq('actor_id', actorId)
    .limit(1)
    .maybeSingle();
  if (linkedErr) {
    // Une panne de lecture rendue en `{account: null}` se lirait « cet acteur n'a pas
    // d'accès » : l'agent réinviterait quelqu'un qui a déjà un compte. Une panne se dit.
    return NextResponse.json({ error: 'profile_read_failed' }, { status: 500 });
  }
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
    // Lu AVANT la suppression : après, l'adresse n'est plus lisible et la trace ne pourrait
    // plus dire QUEL compte a été fermé.
    const { data: target } = await server.auth.admin.getUserById(portal.id);
    const closedEmail = target?.user?.email ?? null;
    const { error: delErr } = await server.auth.admin.deleteUser(portal.id);
    if (delErr) return NextResponse.json({ error: 'revoke_failed' }, { status: 500 });
    const traced = await trace(
      jwt,
      actorId,
      'Accès portail révoqué',
      `Le compte de connexion${closedEmail ? ` (${closedEmail})` : ''} a été supprimé. Les fiches et l’historique des envois restent intacts.`,
    );
    // `app_user_profile.id` est ON DELETE CASCADE sur auth.users : le lien tombe avec le compte.
    return NextResponse.json({ revoked: true, traced });
  }

  // invite / resend
  if (linkedToOtherAccount) {
    // L'index unique refuserait de toute façon un second profil sur cet acteur : mieux vaut
    // le dire ici que laisser l'invitation créer un compte, échouer à l'écriture du profil,
    // et se faire annuler par le rollback — l'e-mail, lui, serait déjà parti.
    return NextResponse.json({ error: 'actor_already_linked' }, { status: 409 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_SHAPE.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 422 });
  const channels = await actorEmailChannels(server, actorId);
  if (!channels.includes(email)) {
    return NextResponse.json({ error: 'email_not_actor_channel' }, { status: 422 });
  }

  // Vrai dès que `resend` a REFERMÉ l'ancien compte. Ce qui suit peut encore échouer, et le
  // message d'échec ne dit alors PAS la même chose que sur `invite` : là, rien n'a bougé ;
  // ici, un compte vient d'être détruit. Une phrase « aucun compte n'a été créé » serait
  // fausse au moment exact où l'agent la lit.
  let previousAccountClosed = false;

  if (portal) {
    // L'acteur A DÉJÀ un compte portail. Tout ce qui n'est pas un renvoi À LA MÊME ADRESSE
    // est refusé ICI, avant `inviteUserByEmail` : sinon l'e-mail partirait, puis l'upsert
    // violerait `uq_app_user_profile_actor_id`, puis le rollback supprimerait le compte —
    // le partenaire recevrait une invitation dont le lien pointe vers un compte détruit.
    if (action === 'invite') {
      return NextResponse.json({ error: 'already_invited' }, { status: 409 });
    }
    const { data: current } = await server.auth.admin.getUserById(portal.id);
    if (!current?.user) return NextResponse.json({ error: 'no_portal_account' }, { status: 409 });
    if ((current.user.email ?? '').toLowerCase() !== email) {
      // Renvoyer à une AUTRE adresse n'est pas un renvoi : c'est une seconde invitation.
      return NextResponse.json({ error: 'already_invited' }, { status: 409 });
    }
    if (current.user.last_sign_in_at) {
      return NextResponse.json({ error: 'already_active' }, { status: 409 });
    }
    // GoTrue refuse `inviteUserByEmail` sur une adresse existante : on supprime puis
    // ré-invite. Rien à perdre — le compte ne s'est jamais connecté. La cible est
    // `portal.id`, jamais un id trouvé par e-mail.
    const { error: delErr } = await server.auth.admin.deleteUser(portal.id);
    if (delErr) return NextResponse.json({ error: 'resend_failed' }, { status: 500 });
    previousAccountClosed = true;
  } else {
    if (action === 'resend') {
      // Sans compte portail, il n'y a rien à renvoyer. Sans ce refus, `resend` se
      // comporterait exactement comme `invite` — le verbe mentirait.
      return NextResponse.json({ error: 'no_portal_account' }, { status: 409 });
    }
    // L'adresse doit être LIBRE. Un e-mail d'agent peut parfaitement figurer dans
    // `actor_channel` (il a répondu pour le partenaire, l'adresse a été consignée) : sans ce
    // refus, on écraserait un compte de l'office.
    // perPage borné : correct à l'échelle actuelle, à revoir si la base de comptes dépasse ~1000.
    const { data: list } = await server.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((user) => user.email?.toLowerCase() === email);
    if (existing) {
      return NextResponse.json({ error: 'email_taken_by_staff' }, { status: 409 });
    }
  }

  const { data: created, error: createErr } = await server.auth.admin.inviteUserByEmail(email, {
    // `?espace=1` : /set-password bascule alors sur la copie destinée au PARTENAIRE
    // (SetPasswordPage: `searchParams.get('espace') === '1'`). Sans ce paramètre, la
    // personne invitée lit la copie écrite pour le personnel de l'office.
    // ⚠ L'allowlist Auth → URL Configuration doit accepter la query string (motif
    // `…/set-password*`), sinon Supabase retombe sur le Site URL et le paramètre est perdu.
    redirectTo: `${inviteOrigin(req)}/set-password?espace=1`,
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: previousAccountClosed ? 'resend_lost_previous' : 'create_failed' },
      { status: 500 },
    );
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
    // Sur un renvoi, l'ancien compte est parti AUSSI : l'acteur se retrouve sans accès du
    // tout, ce que « le compte a été annulé » ne dit pas.
    return NextResponse.json(
      { error: previousAccountClosed ? 'resend_lost_previous' : 'profile_failed' },
      { status: 500 },
    );
  }
  const traced = await trace(
    jwt,
    actorId,
    action === 'resend' ? 'Invitation au portail renvoyée' : 'Accès portail ouvert',
    action === 'resend'
      ? `Une nouvelle invitation a été envoyée à ${email}. Le lien précédent ne fonctionne plus.`
      : `Une invitation a été envoyée à ${email}. La personne choisit son mot de passe, puis accède à ses fiches.`,
  );
  return NextResponse.json({ userId: created.user.id, traced }, { status: 201 });
}
