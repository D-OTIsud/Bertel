// Service « Copier les e-mails d'une sélection » (§211).
//
// Le RPC api.list_selection_emails rend des lignes BRUTES : le dédoublonnage et
// le formatage vivent ici, en fonctions PURES, pour que changer le séparateur
// dans la modale ne coûte aucun aller-retour serveur.
import { getApiClient } from '../lib/supabase';

export type EmailSeparator = 'comma' | 'semicolon' | 'newline';

export interface SelectionEmailRow {
  objectId: string;
  email: string;
  /** Provenance de l'adresse — sert à la ligne « X fiches via le prestataire ». */
  source: 'actor' | 'object';
  /** Rang serveur : l'ordre de la sélection, seul ordre déterministe. */
  ord: number;
}

export interface SelectionEmailsResult {
  requestedCount: number;
  eligibleCount: number;
  excludedCount: number;
  rows: SelectionEmailRow[];
  missing: Array<{ objectId: string; name: string }>;
}

/** Messages d'interface, indexés par `error.code` (le SQLSTATE) — jamais par le texte. */
export const SELECTION_EMAIL_ERROR_MESSAGES: Record<string, string> = {
  '42501': 'Réservé aux éditeurs.',
  PT413: 'Sélection trop large (plus de 2 000 fiches). Affinez le filtre, ou copiez en deux fois.',
  PT404: "Cette liste n'existe plus.",
  // PT400 couvre INVALID_ARGUMENT **et** REASON_REQUIRED : le SQLSTATE ne les
  // distingue pas, et on ne branche jamais sur le texte du message. La modale
  // garde la finalité côté client (≥ 5 caractères), donc en pratique un PT400
  // qui remonte ici n'est plus une finalité manquante.
  PT400: 'Une erreur technique empêche la copie.',
};

/**
 * Longueur minimale de la finalité — miroir de la borne serveur
 * (`PT400/REASON_REQUIRED`, 5–500 caractères). Le serveur reste la garde ; ceci
 * n'est que l'ergonomie, pour ne pas déclencher un aller-retour perdu d'avance.
 */
export const SELECTION_EMAIL_REASON_MIN = 5;
export const SELECTION_EMAIL_REASON_MAX = 500;

const SEPARATORS: Record<EmailSeparator, string> = {
  comma: ', ',
  semicolon: '; ',
  newline: '\n',
};

/**
 * Dédoublonne en conservant l'ordre `ord` défini par le serveur. Trier ici plutôt
 * que se fier à l'ordre du tableau reçu : c'est `ord` qui porte le contrat.
 */
export function dedupeEmails(rows: SelectionEmailRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...rows].sort((a, b) => a.ord - b.ord)) {
    const email = row.email.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function formatEmailList(emails: string[], separator: EmailSeparator): string {
  return emails.join(SEPARATORS[separator]);
}

/**
 * `reason` = la finalité de l'export, PREMIER paramètre obligatoire du RPC
 * (§208) : le serveur la valide (5–500 caractères) et l'inscrit au journal
 * `actor_contact_export_log` dès qu'une adresse provient d'un prestataire. Elle
 * n'est pas optionnelle ici — un défaut de paramètre transformerait un export
 * de PII en accès anonyme.
 */
export async function fetchSelectionEmails(
  input: ({ objectIds: string[] } | { listId: string }) & { reason: string },
): Promise<SelectionEmailsResult> {
  const client = getApiClient();
  if (!client) throw new Error('Client API indisponible.');

  const params =
    'listId' in input
      ? { p_reason: input.reason, p_object_ids: null, p_list_id: input.listId }
      : { p_reason: input.reason, p_object_ids: input.objectIds, p_list_id: null };

  const { data, error } = await client.schema('api').rpc('list_selection_emails', params);
  if (error) {
    // On propage le SQLSTATE : la modale branche dessus, jamais sur le message.
    const wrapped = new Error(error.message || 'Export des e-mails impossible.');
    (wrapped as Error & { code?: string }).code = error.code;
    throw wrapped;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rawMissing = Array.isArray(payload.missing) ? payload.missing : [];

  return {
    requestedCount: Number(payload.requested_count ?? 0),
    eligibleCount: Number(payload.eligible_count ?? 0),
    excludedCount: Number(payload.excluded_count ?? 0),
    rows: rawRows.map((entry) => {
      const r = entry as Record<string, unknown>;
      return {
        objectId: String(r.object_id ?? ''),
        email: String(r.email ?? ''),
        source: r.source === 'actor' ? 'actor' : 'object',
        ord: Number(r.ord ?? 0),
      };
    }),
    missing: rawMissing.map((entry) => {
      const m = entry as Record<string, unknown>;
      return { objectId: String(m.object_id ?? ''), name: String(m.name ?? '') };
    }),
  };
}
