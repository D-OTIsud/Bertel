import type { FicheSubmissionApproval } from '../../services/moderation';
import type { PendingChangeItem } from '../../types/domain';

/** Une ligne encore ouverte : le serveur peut renvoyer des lignes résolues (filtres non-pending). */
export function isPending(item: PendingChangeItem): boolean {
  return !item.status || item.status === 'pending';
}

/**
 * FAIL-CLOSED. `manualApply === false` est la SEULE valeur qui autorise l'approbation ordinaire
 * (« la machine applique »). `true` et `undefined` — fixtures démo, serveur d'avant la §7 —
 * exigent l'attestation : traiter l'inconnu comme automatique rendrait l'approbation en un clic,
 * c'est-à-dire précisément le trou que D9 ferme.
 */
export function requiresAttestation(item: PendingChangeItem): boolean {
  return item.manualApply !== false;
}

export interface SubmissionGroup {
  id: string;
  actorLabel: string | null;
  note: string | null;
  objectName: string;
  submittedAt: string;
  items: PendingChangeItem[];
}

/** Une entrée de la file : un envoi groupé, ou une proposition interne isolée. */
export type QueueEntry =
  | { kind: 'submission'; group: SubmissionGroup }
  | { kind: 'item'; item: PendingChangeItem };

/**
 * Construit la file en PRÉSERVANT l'ordre du serveur (submitted_at DESC) — un seul flux, pas
 * deux populations empilées. Un groupe occupe la position de sa PREMIÈRE ligne ; les lignes
 * suivantes du même envoi le rejoignent sans déplacer quoi que ce soit. Rendre tous les envois
 * puis toutes les lignes isolées ferait passer une proposition interne du jour SOUS un envoi
 * partenaire plus ancien : l'ordre affiché ne serait plus celui qui a été demandé.
 */
export function buildQueue(items: PendingChangeItem[]): QueueEntry[] {
  const entries: QueueEntry[] = [];
  const byId = new Map<string, SubmissionGroup>();
  for (const item of items) {
    const submissionId = item.submissionId;
    if (!submissionId) {
      entries.push({ kind: 'item', item });
      continue;
    }
    let group = byId.get(submissionId);
    if (!group) {
      group = {
        id: submissionId,
        actorLabel: item.actorLabel ?? null,
        note: item.submissionNote ?? null,
        objectName: item.objectName,
        submittedAt: item.submittedAt,
        items: [],
      };
      byId.set(submissionId, group);
      entries.push({ kind: 'submission', group });
    }
    group.items.push(item);
  }
  return entries;
}

/** Le libellé d'une rubrique, tel que l'agent le lit dans la file. */
export function rubricLabel(item: PendingChangeItem): string {
  return item.field || item.targetTable || 'rubrique';
}

/**
 * Ce que le RPC groupé vient RÉELLEMENT de faire, en une phrase. Sans elle, un « Tout approuver »
 * partiel est indiscernable d'un « Tout approuver » complet : le panneau rétrécit, et rien ne dit
 * si des rubriques sont restées en attente.
 */
export function describeApproval(result: FicheSubmissionApproval): string {
  const parts: string[] = [];
  if (result.appliedCount > 0) {
    parts.push(`${result.appliedCount} modification${result.appliedCount > 1 ? 's' : ''} appliquée${result.appliedCount > 1 ? 's' : ''} automatiquement`);
  }
  if (result.approvedManualCount > 0) {
    parts.push(`${result.approvedManualCount} validée${result.approvedManualCount > 1 ? 's' : ''} sur votre attestation`);
  }
  if (result.skippedManualCount > 0) {
    parts.push(`${result.skippedManualCount} laissée${result.skippedManualCount > 1 ? 's' : ''} en attente`);
  }
  if (parts.length === 0) return 'Envoi traité : aucune modification n’a changé d’état.';
  const suffix = result.skippedManualCount > 0 ? ' L’envoi reste ouvert.' : '';
  return `Envoi traité : ${parts.join(', ')}.${suffix}`;
}

/** Cible du refus : une ligne isolée, ou l'envoi entier (deux RPC, une seule modale de motif). */
export type RejectTarget =
  | { kind: 'item'; id: string; label: string }
  | { kind: 'submission'; id: string; label: string };

