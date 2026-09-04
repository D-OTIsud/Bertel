/**
 * Service du portail partenaire (18a).
 *
 * TOUT passe par les RPC `api.*` DEFINER, auto-scopés : le destinataire est TOUJOURS
 * `auth.uid()`, jamais un paramètre « pour qui » (doctrine notifications). `fiche_submission`,
 * `pending_change`, `crm_*`, `app_notification` et `org_actor_module_visibility` sont RLS
 * service_role only — **ne JAMAIS ajouter un `client.from(...)` dans ce fichier** : il rendrait
 * silencieusement zéro ligne (RLS), ce qui se lit comme « vous n'avez rien envoyé » et non comme
 * une panne. Même règle que `services/moderation.ts`.
 *
 * La soumission transporte les enveloppes contributeur EXACTES de `buildContributorSubmission`
 * (P1.3) : le serveur revalide sections, plancher et whitelist de writers. Le front ne dispatche
 * rien et ne réécrit rien.
 *
 * VOCABULAIRE. Les messages de repli de ce fichier atteignent l'écran d'un partenaire — souvent
 * peu à l'aise avec l'informatique, souvent sur un téléphone. Ils sont donc rédigés en français
 * courant, sans les mots de l'outil interne (« soumission », « section », « modération »), et
 * disent systématiquement si quelque chose a été perdu.
 */
import { getApiClient } from '../lib/supabase';
import { mapDatabaseError } from './api-error';
import type { SubmitPendingChangeInput } from './moderation';

type GenericRecord = Record<string, unknown>;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as GenericRecord) : null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function requireApiClient() {
  const client = getApiClient();
  if (!client) {
    // Le portail n'a pas de mode démo : sans client, il n'y a rien à afficher, et le dire
    // vaut mieux qu'un écran vide que le partenaire lirait comme « je n'ai aucune fiche ».
    throw new Error('Le service est momentanément indisponible. Réessayez dans un instant.');
  }
  return client;
}

/**
 * Erreur FR d'un RPC du portail, **SQLSTATE conservé**.
 *
 * `mapDatabaseError` (api-error.ts:265-296) traduit bien le message mais JETTE `error.code` :
 * son repli final est `new Error(fallback)`. Or la fenêtre d'envoi doit distinguer deux refus
 * qui n'appellent pas du tout la même phrase — `PT409` (une vérification est déjà en cours,
 * inutile de réessayer maintenant) et `22023` (l'office a fermé une rubrique, il faut la retirer
 * de l'envoi) — d'une panne quelconque. Sans ce rattachement, la branche serait INATTEIGNABLE.
 * Le code remonte bien de PostgREST : c'est le front qui le perdait.
 *
 * Même geste que `services/selection-emails.ts:93-99`. Le rattachement est INCONDITIONNEL :
 * une liste de codes ici se désynchroniserait du SQL au premier `RAISE` ajouté.
 */
function portalRpcError(error: unknown, fallback: string): Error & { code?: string } {
  const wrapped = mapDatabaseError(error, fallback) as Error & { code?: string };
  const record = readRecord(error);
  const code = record ? readNullableString(record.code) : null;
  if (code) wrapped.code = code;
  return wrapped;
}

/**
 * Les QUATRE statuts d'un changement — `approved` n'est PAS un synonyme d'`applied`.
 *
 * `applied` = la machine a réécrit la fiche (rubriques auto). `approved` = l'office a accepté et
 * **reporté à la main** (§7, branche attestée) : c'est la forme DOMINANTE, 5 rubriques sur 7.
 * Un libellé d'écran qui n'en couvre que trois laisse le partenaire sans réponse sur le cas le
 * plus fréquent. Exporté pour que ces tables de libellés soient exhaustives par construction.
 */
export type PortalChangeStatus = 'pending' | 'approved' | 'applied' | 'rejected';

/**
 * Les QUATRE statuts d'un envoi (CHECK de `fiche_submission`). `partial` = l'office a retenu une
 * partie des rubriques et refusé le reste ; ce n'est ni une acceptation ni un refus.
 */
export type PortalSubmissionStatus = 'pending' | 'approved' | 'rejected' | 'partial';

export interface PortalFiche {
  id: string;
  name: string;
  objectType: string;
  status: string;
  updatedAt: string | null;
  /** La vérification EN COURS, s'il y en a une : une seule est possible à la fois par fiche. */
  openSubmission: { id: string; submittedAt: string } | null;
  /** Le dernier retour de l'office — `status` ∈ {@link PortalSubmissionStatus} moins `pending`. */
  lastResolved: { status: string; resolvedAt: string | null } | null;
  /**
   * Coordonnées PUBLIQUES de l'office qui publie la fiche (D11), `null` si l'ORG n'en a pas —
   * c'est le cas des deux ORG de production au 2026-09-02, d'où le prérequis de recette.
   * Les DEUX comptent : un `mailto:` échoue EN SILENCE sur un téléphone sans application de
   * courrier, donc le numéro n'est pas décoratif, il est le second chemin.
   */
  officeEmail: string | null;
  officePhone: string | null;
}

export async function listMyPortalFiches(): Promise<PortalFiche[]> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_my_portal_fiches', {});
  if (error) throw portalRpcError(error, "Nous n'avons pas pu afficher vos fiches. Réessayez dans un instant.");
  if (!Array.isArray(data)) return [];

  const fiches: PortalFiche[] = [];
  for (const row of data) {
    const record = readRecord(row);
    if (!record) continue;
    const id = readNullableString(record.id);
    // Parsing défensif : une ligne abîmée est écartée, elle ne vide pas l'accueil.
    if (!id) continue;
    const open = readRecord(record.open_submission);
    const resolved = readRecord(record.last_resolved);
    fiches.push({
      id,
      name: readString(record.name),
      objectType: readString(record.object_type),
      status: readString(record.status, 'draft'),
      updatedAt: readNullableString(record.updated_at),
      openSubmission:
        open && readNullableString(open.id)
          ? { id: readString(open.id), submittedAt: readString(open.submitted_at) }
          : null,
      lastResolved:
        resolved && readNullableString(resolved.status)
          ? { status: readString(resolved.status), resolvedAt: readNullableString(resolved.resolved_at) }
          : null,
      officeEmail: readNullableString(record.office_email),
      officePhone: readNullableString(record.office_phone),
    });
  }
  return fiches;
}

export interface MySubmissionChange {
  id: string;
  /**
   * Le module id (`metadata.section`) — la clé STABLE qui ancre l'état sur la bonne rubrique.
   * `field` en est le libellé lisible : il change avec la traduction, jamais lui.
   */
  section: string | null;
  field: string;
  /** {@link PortalChangeStatus} — transmis TEL QUEL, jamais replié sur une valeur connue. */
  status: string;
  reviewNote: string | null;
  reviewerLabel: string | null;
}

export interface MySubmission {
  id: string;
  objectId: string;
  objectName: string;
  note: string | null;
  /** {@link PortalSubmissionStatus} — transmis tel quel (`partial` compris). */
  status: string;
  submittedAt: string;
  resolvedAt: string | null;
  changes: MySubmissionChange[];
}

/**
 * Les derniers envois du partenaire COURANT (auto-scopé côté serveur).
 *
 * `objectId` : la fiche ouverte passe TOUJOURS son id. Sans ce filtre, le RPC rend les
 * `limit` derniers envois TOUTES fiches confondues — la vérification en cours de la fiche
 * affichée peut donc sortir de la fenêtre chez un partenaire multi-fiches, et les rubriques
 * resteraient muettes SANS la moindre erreur.
 */
export async function listMySubmissions(
  limit = 20,
  objectId: string | null = null,
): Promise<MySubmission[]> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_my_submissions', {
    p_limit: limit,
    p_object_id: objectId,
  });
  if (error) {
    throw portalRpcError(error, "Nous n'avons pas pu afficher vos derniers envois. Réessayez dans un instant.");
  }
  if (!Array.isArray(data)) return [];

  const submissions: MySubmission[] = [];
  for (const row of data) {
    const record = readRecord(row);
    if (!record) continue;
    const id = readNullableString(record.id);
    if (!id) continue;
    submissions.push({
      id,
      objectId: readString(record.object_id),
      objectName: readString(record.object_name),
      note: readNullableString(record.note),
      status: readString(record.status, 'pending'),
      submittedAt: readString(record.submitted_at),
      resolvedAt: readNullableString(record.resolved_at),
      changes: parseSubmissionChanges(record.changes),
    });
  }
  return submissions;
}

function parseSubmissionChanges(value: unknown): MySubmissionChange[] {
  if (!Array.isArray(value)) return [];
  const changes: MySubmissionChange[] = [];
  for (const entry of value) {
    const change = readRecord(entry);
    if (!change) continue;
    const id = readNullableString(change.id);
    if (!id) continue;
    changes.push({
      id,
      section: readNullableString(change.section),
      field: readString(change.field),
      // TEL QUEL, sans allowlist : replier une valeur non prévue sur `pending` ferait lire
      // « en cours de vérification » à un partenaire dont la rubrique est déjà tranchée.
      status: readString(change.status, 'pending'),
      reviewNote: readNullableString(change.review_note),
      reviewerLabel: readNullableString(change.reviewer_label),
    });
  }
  return changes;
}

export interface PortalVisibility {
  /** Rubriques que l'office ne peut PAS masquer (plancher serveur). */
  floorModules: string[];
  /** Rubriques que cet office a masquées pour ce type de fiche. */
  maskedModules: string[];
}

export async function getPortalSectionVisibility(objectId: string): Promise<PortalVisibility> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('get_portal_section_visibility', {
    p_object_id: objectId,
  });
  if (error) throw portalRpcError(error, "Nous n'avons pas pu ouvrir votre fiche. Réessayez dans un instant.");
  const record = readRecord(data) ?? {};
  return {
    floorModules: readStringList(record.floor_modules),
    maskedModules: readStringList(record.masked_modules),
  };
}

export interface SubmitActorFicheResult {
  submissionId: string;
  taskId: string;
  changeCount: number;
  assigneeCount: number;
}

/**
 * « Envoyer à l'office » — UN appel, tout ou rien (le RPC est transactionnel).
 *
 * `changes` sont les enveloppes de `buildContributorSubmission`, non modifiées. Leur `metadata`
 * est DÉJÀ en snake_case (`manual_apply`, `section`, `rpc`…) et le SQL la relit mot pour mot :
 * la traduction camelCase → snake_case n'a lieu qu'ICI, et seulement sur l'enveloppe elle-même.
 * `objectId` de l'enveloppe n'est PAS repris dans `p_changes` — la fiche cible est portée une
 * seule fois, par `p_object_id`, que le serveur contrôle contre le périmètre du compte.
 */
export async function submitActorFiche(
  objectId: string,
  changes: SubmitPendingChangeInput[],
  note: string | null,
): Promise<SubmitActorFicheResult> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('submit_actor_fiche', {
    p_object_id: objectId,
    p_changes: changes.map((change) => ({
      target_table: change.targetTable,
      target_pk: change.targetPk ?? null,
      action: change.action,
      payload: change.payload,
      metadata: change.metadata ?? null,
    })),
    p_note: note,
  });
  // Le SQLSTATE survit : PT409 (« déjà en cours ») et 22023 (« rubrique fermée ») appellent
  // chacun leur propre phrase, et aucune des deux ne se devine depuis le message.
  if (error) throw portalRpcError(error, "Nous n'avons pas pu envoyer vos modifications. Rien n'est perdu.");

  const record = readRecord(data) ?? {};
  const submissionId = readNullableString(record.submission_id);
  if (!submissionId) {
    // L'envoi est peut-être passé : ne PAS inviter à renvoyer aveuglément — un second envoi
    // se heurterait à PT409 et le partenaire croirait avoir tout perdu.
    throw new Error("Nous n'avons pas pu confirmer votre envoi. Rechargez la page avant de renvoyer.");
  }
  return {
    submissionId,
    taskId: readString(record.task_id),
    changeCount: typeof record.change_count === 'number' ? record.change_count : 0,
    assigneeCount: typeof record.assignee_count === 'number' ? record.assignee_count : 0,
  };
}
