/**
 * Traduction des erreurs machine en messages FRANÇAIS destinés à l'utilisateur.
 *
 * POURQUOI CE MODULE (chantier 2026-08-28 n°4, lot A). Le problème n'était pas des chaînes
 * anglaises codées en dur — il n'y en a presque pas — mais un **pass-through de l'anglais
 * backend** répliqué à l'identique dans onze services : `payload.detail ?? payload.error` puis
 * `throw new Error(detail)`. L'utilisateur lisait donc littéralement « Unsupported MIME type:
 * image/gif », « Storage upload failed: … », des codes machine (`upload_failed`, `forbidden`) et
 * même le nom d'une variable d'environnement (`SUPABASE_SERVICE_ROLE_KEY missing`, émis par
 * 8 routes).
 *
 * DEUX RÈGLES, valables partout dans ce fichier :
 *  1. **Le brut n'est JAMAIS affiché.** Il part en `console.warn` — entier en développement,
 *     réduit au statut et au code en production, parce qu'un `detail` de route peut porter des
 *     noms de tables, des données ou de la configuration.
 *  2. **Un code inconnu ne fait pas échouer la traduction** : il retombe sur un message générique
 *     qui donne au moins le statut, de quoi ouvrir un ticket utile.
 */

/** Vrai en dev/test, faux en production — décide de ce qui part au journal. */
function isVerboseEnv(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Journalise un brut NON traduit. En production, seuls le statut et le code sortent : le `detail`
 * d'une route peut porter des noms de tables, des données ou de la configuration.
 */
function warnUntranslated(scope: string, fields: { status?: number; code?: string; detail?: unknown }): void {
  if (isVerboseEnv()) {
    console.warn(`[${scope}] réponse non mappée`, fields);
  } else {
    console.warn(`[${scope}] réponse non mappée`, { status: fields.status, code: fields.code });
  }
}

/**
 * Codes émis par les routes `src/app/api/**` (champ `error` de la réponse JSON) → message FR.
 *
 * Les trois derniers (`mime`, `size`, `decode`) sont émis DYNAMIQUEMENT par
 * `media/upload/route.ts` (`error: err.code`) : ils n'apparaissent dans aucun grep de littéraux,
 * et ce sont pourtant ceux que l'utilisateur rencontre le plus souvent.
 */
export const API_ERROR_LABELS: Record<string, string> = {
  // --- Authentification / autorisation ---------------------------------------------------
  unauthenticated: 'Vous devez être connecté pour effectuer cette action.',
  unauthorized: "Cette action n'est pas autorisée avec vos droits actuels.",
  forbidden: "Cette action n'est pas autorisée avec vos droits actuels.",
  self_delete_forbidden: 'Vous ne pouvez pas supprimer votre propre compte.',
  rate_limited: 'Trop de tentatives. Patientez une minute avant de réessayer.',
  // Panneau Équipe (/api/admin/user-profile) — un admin ne peut pas s'auto-éditer depuis cet
  // écran : son identité a sa propre surface (Paramètres → Mon compte).
  self_edit_forbidden: 'Vous ne pouvez pas modifier votre propre profil depuis cet écran — utilisez Paramètres → Mon compte.',
  out_of_scope: "Ce membre n'appartient pas à votre organisation.",
  // Le mot « owner » reste littéral : c'est le nom du rôle plateforme tel qu'exposé ailleurs
  // dans l'écran (PLATFORM_ROLES), pas une simple décoration.
  owner_required: 'Seul un propriétaire (owner) de la plateforme peut attribuer ou retirer un rang plateforme.',
  email_claims_actor:
    "Cette adresse est celle d'un prestataire : l'attribuer à ce compte lui donnerait la propriété de ses fiches. Réservé à un superuser plateforme.",
  // CRITIQUE (revue finale 2026-08-29) — changer l'e-mail de connexion d'un owner/super_admin
  // équivaut à prendre son compte (le lien de réinitialisation part à la nouvelle adresse).
  owner_required_for_email:
    "Ce compte a un rang plateforme privilégié : seul un propriétaire (owner) de la plateforme peut changer son adresse de connexion.",
  // Volet rang d'ORG (revue finale) — même famille que RANK_VIOLATION côté RPC (rbac.ts/FRIENDLY),
  // ici pour la route /api/admin/user-profile qui n'émet pas de RAISE SQL.
  rank_violation: 'Action impossible sur un membre dont le rang d’administration est égal ou supérieur au vôtre.',
  target_rank_check_failed:
    "La vérification du rang d'administration a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",

  // --- Requête malformée ------------------------------------------------------------------
  bad_json: 'Requête invalide. Rechargez la page et réessayez.',
  bad_multipart: 'Le fichier envoyé est illisible. Réessayez depuis le formulaire.',
  bad_request: 'Requête invalide. Rechargez la page et réessayez.',
  invalid_fields: 'Certains champs sont invalides.',
  missing_fields: 'Des champs obligatoires sont manquants.',
  invalid_email: "L'adresse e-mail est invalide.",
  invalid_mode: 'Mode demandé inconnu.',
  invalid_actor_id: 'Identifiant de contact invalide.',
  invalid_object_id: 'Identifiant de fiche invalide.',
  invalid_user_id: 'Identifiant utilisateur invalide.',
  invalid_subject_kind: 'Type de personne concernée inconnu.',
  invalid_platform_role: 'Rôle plateforme inconnu.',
  // `detail` porte le nom du champ inconnu envoyé par le client — jamais affiché (règle 1) : un
  // champ inattendu vient d'un formulaire désynchronisé de la route, rien que recharger ne répare.
  unknown_field: 'Requête invalide : un champ inattendu a été envoyé. Rechargez la page et réessayez.',
  missing_confirm_name: 'Saisissez le nom exact de la fiche pour confirmer.',
  missing_object_id: 'Aucune fiche cible fournie.',
  missing_subject_id: 'Aucune personne concernée fournie.',
  missing_list: 'Aucune liste cible fournie.',
  missing_file: 'Aucun fichier fourni.',
  file_missing: 'Aucun fichier fourni.',
  unknown_document_type: 'Type de document inconnu.',
  unknown_endpoint: "Cette adresse d'API n'existe pas.",

  // --- Introuvable / état incompatible -----------------------------------------------------
  not_found: 'Élément introuvable — il a peut-être été supprimé entre-temps.',
  source_missing: 'Le document source est introuvable.',
  already_active: 'Ce compte est déjà actif.',
  already_promoted: 'Ce document a déjà été rattaché à la fiche.',
  promoted_document: 'Ce document a déjà été rattaché à la fiche.',
  // Panneau Équipe : le compte visé peut avoir été supprimé entre le chargement du roster et
  // l'action (§209/§211 : la liste n'est jamais la garde, seulement une lecture antérieure).
  user_not_found: "Ce compte n'existe plus — la liste est peut-être obsolète, rechargez la page.",
  email_taken: 'Cette adresse est déjà utilisée par un autre compte.',

  // --- Médias / fichiers --------------------------------------------------------------------
  upload_failed: "Le téléversement a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
  promotion_upload_failed: 'Le transfert du document vers la fiche a échoué.',
  promotion_document_failed: "L'enregistrement du document rattaché a échoué.",
  document_create_failed: "L'enregistrement du document a échoué.",
  actor_document_create_failed: "L'enregistrement du document du contact a échoué.",
  // --- Pièces jointes de tâche CRM (17i, /api/task-document) ------------------------------
  // Les cinq codes ci-dessous sont NÉS d'un clone d'`actor-document`, dont la couverture était
  // de 100 % : `actor_document_create_failed` figure juste au-dessus. Sans eux, l'utilisateur
  // lisait « Une erreur est survenue (code 500) » précisément sur les chemins que la route
  // distingue avec le plus de soin — erreur de LECTURE ≠ absence, orphelin storage, bucket
  // inattendu. Le travail de distinction était fait côté route et jeté côté écran.
  // AUCUN d'eux ne doit rejoindre `CODES_WITH_BUSINESS_DETAIL` : leur `detail` porte un
  // message Postgres/Storage brut, pas un `RAISE` métier français (règle 1 du module).
  task_document_create_failed: "L'enregistrement de la pièce jointe a échoué.",
  // Erreur de LECTURE, pas une absence : le fichier existe peut-être encore. Le dire
  // autrement (« introuvable ») ferait croire à une suppression qui n'a pas eu lieu.
  link_lookup_failed:
    "La vérification de la pièce jointe a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
  document_lookup_failed:
    "La lecture de la pièce jointe a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
  // La suppression a été INTERROMPUE AVANT d'effacer quoi que ce soit : le message doit dire
  // que la pièce est toujours là, sinon l'utilisateur la croit partie et ne réessaie pas.
  storage_remove_failed:
    "Le retrait du fichier a échoué : la pièce jointe n'a pas été supprimée. Réessayez ; si le problème persiste, contactez l'administrateur.",
  // 409 : la ligne pointe hors du bucket des pièces jointes. Rien à faire depuis l'écran —
  // c'est une anomalie de données, et l'utilisateur doit savoir que réessayer ne servira à rien.
  unexpected_bucket:
    "Cette pièce jointe pointe vers un espace de stockage inattendu : elle ne peut être ni ouverte ni supprimée depuis cet écran. Signalez-la à l'administrateur.",
  image_prep_failed: "L'image n'a pas pu être préparée. Réessayez avec un autre fichier.",
  download_failed: 'Le téléchargement a échoué.',
  signed_url_failed: "Le lien de téléchargement n'a pas pu être généré.",
  process_failed: 'Le traitement du fichier a échoué.',
  extraction_failed: "L'extraction automatique a échoué. Saisissez les informations manuellement.",
  // Émis dynamiquement par media/upload/route.ts via `error: err.code`.
  mime: 'Format de fichier non pris en charge.',
  size: 'Fichier trop volumineux.',
  decode: "Le fichier n'a pas pu être lu : il est peut-être corrompu.",

  // --- Écritures ----------------------------------------------------------------------------
  create_failed: 'La création a échoué.',
  update_failed: 'La mise à jour a échoué.',
  delete_failed: 'La suppression a échoué.',
  share_failed: 'Le partage a échoué.',
  send_failed: "L'envoi a échoué.",
  resend_failed: "Le renvoi de l'invitation a échoué.",
  invite_failed: "L'invitation a échoué.",
  erase_failed: "L'effacement a échoué.",
  object_link_failed: 'Le rattachement à la fiche a échoué.',
  history_update_failed: "La mise à jour de l'historique a échoué.",
  profile_update_failed: 'La mise à jour du profil a échoué.',
  // Ces trois-là relaient un `detail` technique (message Postgres/GoTrue brut, potentiellement en
  // anglais) — le mapper ici est ce qui empêche ce brut d'atteindre l'écran (règle 1).
  profile_read_failed: "La lecture du profil a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
  actor_check_failed: "La vérification de l'adresse a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",
  email_update_failed: "La mise à jour de l'adresse e-mail a échoué. Réessayez ; si le problème persiste, contactez l'administrateur.",

  // --- Configuration serveur ------------------------------------------------------------------
  // Ne JAMAIS relayer le `detail` associé : il nomme la variable d'environnement manquante.
  server_misconfigured: "Configuration serveur incomplète. Contactez l'administrateur.",
  smtp_not_configured: "L'envoi d'e-mail n'est pas encore configuré (SMTP).",
  upstream_error: 'Le service distant est indisponible. Réessayez dans un instant.',
};

/**
 * Message FR pour une réponse de route en échec. Le `detail` brut n'est jamais rendu.
 *
 * @param payload corps JSON de la réponse (peut être `null` si le corps n'était pas du JSON)
 * @param status  statut HTTP, repris dans le message générique pour rendre un ticket exploitable
 */
/**
 * Codes dont le `detail` EST le message métier d'un RPC, relayé tel quel par la route
 * (`{ error: 'delete_failed', detail: msg }` où `msg` vient du `RAISE` SQL). Nos `RAISE` sont
 * rédigés en français et sont BEAUCOUP plus précis que le libellé générique — « Effacement RGPD
 * réservé aux administrateurs plateforme. » vaut mieux que « L'effacement a échoué. ».
 *
 * Allowlist EXPLICITE, jamais une heuristique sur le contenu : si une de ces routes se met un jour
 * à relayer de l'anglais technique, c'est un défaut à corriger À LA SOURCE (comme le pipeline
 * média l'a été), pas une devinette à faire ici. Tous les autres codes gardent leur `detail` au
 * journal — il est technique, anglais, ou porte de la configuration.
 */
const CODES_WITH_BUSINESS_DETAIL = new Set(['delete_failed', 'erase_failed']);

export function readApiErrorMessage(
  payload: { error?: string; detail?: string } | null | undefined,
  status: number,
): string {
  const code = payload?.error ?? '';
  const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : '';

  if (code && CODES_WITH_BUSINESS_DETAIL.has(code) && detail) {
    return detail;
  }

  const mapped = API_ERROR_LABELS[code];
  if (mapped) {
    return mapped;
  }

  warnUntranslated('api-error', { status, code: code || undefined, detail: payload?.detail });

  if (status === 401) return API_ERROR_LABELS.unauthenticated;
  if (status === 403) return API_ERROR_LABELS.forbidden;
  if (status === 404) return API_ERROR_LABELS.not_found;
  if (status === 413 || status === 415) return "Ce fichier n'est pas accepté (format ou taille).";
  if (status === 429) return API_ERROR_LABELS.rate_limited;

  return `Une erreur est survenue (code ${status}). Réessayez ; si le problème persiste, contactez l'administrateur.`;
}

/**
 * Construit l'`Error` FR à lever pour une réponse de route en échec. Remplace le pattern
 * dupliqué `payload.detail ?? payload.error` + `throw new Error(detail)`.
 *
 * Le corps est lu en `try/catch` : une route qui rend du HTML (502 d'un proxy) ou un corps vide
 * ne doit pas produire une exception de parsing à la place du message.
 */
export async function apiError(response: Response): Promise<Error> {
  let payload: { error?: string; detail?: string } | null = null;
  try {
    payload = (await response.json()) as { error?: string; detail?: string };
  } catch {
    // Corps non-JSON (HTML d'erreur, corps vide) : on garde le repli par statut.
  }
  return new Error(readApiErrorMessage(payload, response.status));
}

/** Erreur FR pour un `fetch` qui n'a même pas abouti (réseau coupé, DNS, CORS). */
export function networkError(cause: unknown): Error {
  warnUntranslated('api-error', { detail: cause });
  return new Error('Connexion impossible. Vérifiez votre connexion réseau et réessayez.');
}

/**
 * SQLSTATE PostgreSQL → message FR. Table volontairement courte : ne sont traduits que les codes
 * dont l'utilisateur peut faire quelque chose.
 */
const SQLSTATE_LABELS: Record<string, string> = {
  '42501': "Cette action n'est pas autorisée avec vos droits actuels.",
  '23505': 'Cette valeur existe déjà (doublon).',
  '23503': 'Un élément lié a été supprimé entre-temps — rechargez la fiche.',
  '23514': 'Une valeur enregistrée est invalide.',
  '23502': 'Une valeur obligatoire est manquante.',
  '22P02': 'Format de valeur invalide.',
  '22001': 'Texte trop long pour ce champ.',
  '57014': 'La requête a pris trop de temps. Affinez vos filtres et réessayez.',
  PGRST301: 'Session expirée — reconnectez-vous.',
};

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

function readCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}

/**
 * Traduit une erreur PostgREST / Supabase en message FR.
 *
 * **La priorité est INVERSÉE par rapport à l'ancien `mapMutationError`** : on mappe d'abord, et à
 * défaut on rend le `fallback` FRANÇAIS du site d'appel — jamais le message brut. C'est ce qui
 * réactive d'un coup les ~100 beaux messages français déjà écrits dans `object-workspace.ts` et
 * les ~14 de `lists`/`moderation`, qui étaient du code quasi mort : `error.message` n'est
 * pratiquement jamais vide, donc le français n'était jamais atteint.
 *
 * **`P0001` passe TEL QUEL** : c'est notre propre `RAISE EXCEPTION`, et nos RPC lèvent des phrases
 * déjà françaises (« Écriture CRM non autorisée », « objet ou acteur requis »). Les rares codes en
 * capitales (`FORBIDDEN`, `MUST_ARCHIVE_FIRST`…) sont traduits EN AMONT par les traducteurs
 * dédiés (`friendlyStatusError`, la table `FRIENDLY` de `rbac.ts`) — les doublonner ici les
 * court-circuiterait.
 */
export function mapDatabaseError(error: unknown, fallback: string): Error {
  const message = readMessage(error);
  const code = readCode(error);
  const normalized = `${code} ${message}`.toLowerCase();

  if (code && SQLSTATE_LABELS[code]) {
    return new Error(SQLSTATE_LABELS[code]);
  }

  // Certains chemins perdent le `code` et ne laissent que le texte.
  if (normalized.includes('row-level security') || normalized.includes('42501')) {
    return new Error(SQLSTATE_LABELS['42501']);
  }
  if (normalized.includes('jwt expired') || normalized.includes('pgrst301')) {
    return new Error(SQLSTATE_LABELS.PGRST301);
  }
  if (normalized.includes('statement timeout') || normalized.includes('57014')) {
    return new Error(SQLSTATE_LABELS['57014']);
  }

  // Nos propres RAISE : le message EST le message utilisateur, et il est plus précis que le
  // fallback du site d'appel. `22023` (invalid_parameter_value) n'est produit dans ce dépôt QUE
  // par nos `RAISE … USING ERRCODE = '22023'` — refus de règle métier, rédigés en français.
  if ((code === 'P0001' || code === '22023') && message) {
    return new Error(message);
  }

  if (message) {
    warnUntranslated('db-error', { code: code || undefined, detail: message });
  }
  return new Error(fallback);
}
