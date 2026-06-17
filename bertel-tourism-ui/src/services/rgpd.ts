// RGPD Art. 17 — client service. Calls POST /api/rgpd/erase, which runs the SQL erasure RPC
// as the caller (superuser-gated) then deletes the reported Storage files / auth account.

export const ERASURE_SUBJECT_KINDS = [
  'actor',
  'incident',
  'review',
  'object_legal',
  'contact_channel',
  'user',
] as const;
export type ErasureSubjectKind = (typeof ERASURE_SUBJECT_KINDS)[number];

export type ErasureMode = 'anonymize' | 'delete';

export const ERASURE_KIND_LABELS: Record<ErasureSubjectKind, string> = {
  actor: 'Acteur — identité, canaux, consentements, CRM lié',
  incident: "Déclarant d'un signalement (incident)",
  review: "Auteur d'un avis (object_review)",
  object_legal: 'Donnée légale — entrepreneur individuel',
  contact_channel: 'Coordonnée de contact',
  user: 'Compte utilisateur interne',
};

/** Human hint about what identifier to paste for a given subject kind. */
export const ERASURE_ID_HINT: Record<ErasureSubjectKind, string> = {
  actor: "UUID de l'acteur (actor.id)",
  incident: 'UUID du signalement (incident_report.id)',
  review: "UUID de l'avis (object_review.id)",
  object_legal: 'UUID de la ligne légale (object_legal.id)',
  contact_channel: 'UUID de la coordonnée (contact_channel.id)',
  user: "UUID du compte (auth.users.id / app_user_profile.id)",
};

export interface ErasureInput {
  subjectKind: ErasureSubjectKind;
  subjectId: string;
  mode: ErasureMode;
  reason?: string | null;
  accessToken: string;
}

export interface ErasureResult {
  ok: boolean;
  report: Record<string, unknown>;
  storageDeleted: string[];
  storageError: string | null;
  authUserDeleted: boolean;
  authError: string | null;
}

export async function requestErasure(input: ErasureInput): Promise<ErasureResult> {
  const response = await fetch('/api/rgpd/erase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      mode: input.mode,
      reason: input.reason ?? null,
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return (await response.json()) as ErasureResult;
}
