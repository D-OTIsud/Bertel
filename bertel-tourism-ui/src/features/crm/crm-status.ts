/**
 * Registre UNIQUE du vocabulaire de statut des interactions CRM (spec 2026-08-31 §6.1).
 *
 * BILINGUE pendant la fenêtre de déploiement : la base parle `planned`/`done` jusqu'à la
 * migration du cycle de vie, puis `new`/…/`canceled`. Le SQL s'applique à la main et le
 * front arrive par build Coolify — entre les deux, ce registre garantit qu'aucun des deux
 * vocabulaires ne rend une chip vide. Les entrées legacy se retirent avec la tolérance
 * TOLERANCE-17g côté serveur, jamais avant.
 *
 * NE PAS confondre avec le vocabulaire des TÂCHES (`CrmTaskStatus` : todo, in_progress,
 * done, canceled, blocked) — `done`, `canceled` et `in_progress` existent dans les deux.
 */
export type CrmInteractionStatus =
  | 'new'
  | 'in_progress'
  | 'awaiting_provider'
  | 'resolved'
  | 'closed'
  | 'canceled';
export type LegacyCrmInteractionStatus = 'planned' | 'done';
export type AnyCrmInteractionStatus = CrmInteractionStatus | LegacyCrmInteractionStatus;

export type InteractionStatusTone = 'open' | 'waiting' | 'done' | 'closed' | 'canceled';

const REGISTRY: Record<string, { label: string; tone: InteractionStatusTone; open: boolean }> = {
  new: { label: 'En attente de traitement', tone: 'open', open: true },
  in_progress: { label: 'En cours', tone: 'open', open: true },
  awaiting_provider: { label: 'Attente prestataire', tone: 'waiting', open: true },
  resolved: { label: 'Traitée', tone: 'done', open: false },
  closed: { label: 'Clôturée', tone: 'closed', open: false },
  canceled: { label: 'Annulée', tone: 'canceled', open: false },
  // Legacy — la base d'avant la bascule. Libellés historiques conservés à l'identique.
  planned: { label: 'En attente', tone: 'open', open: true },
  done: { label: 'Traitée', tone: 'done', open: false },
};

export function interactionStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  return REGISTRY[status]?.label ?? null;
}

export function interactionStatusTone(status: string): InteractionStatusTone {
  return REGISTRY[status]?.tone ?? 'open';
}

export function isOpenInteractionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return REGISTRY[status]?.open ?? false;
}

/**
 * Le code appartient-il au registre (les deux vocabulaires confondus) ? Sert à distinguer
 * « fermé au sens du registre » d'« absent du registre » — un appelant ne doit jamais traiter
 * ces deux cas comme équivalents (cf. isOpenInteractionStatus, qui répond `false` aux deux).
 */
export function isKnownInteractionStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return Object.prototype.hasOwnProperty.call(REGISTRY, status);
}

/** Ni traitée, ni clôturée, ni annulée — pilote le prompt de clôture du kanban (§66). */
export const CLOSED_INTERACTION_STATUSES: ReadonlySet<string> = new Set(
  Object.entries(REGISTRY)
    .filter(([, v]) => !v.open)
    .map(([k]) => k),
);
