import type { ActorContactsRow } from './export-columns';

export const ACTOR_EXPORT_BATCH = 500; // plafond PAR APPEL du RPC (16t) — au-delà on découpe : N lignes de journal, pas une. Aucun plafond fonctionnel d'export (R1).

/** R1 — résultat AGRÉGÉ des lots : tous partagent un export_run_id ; chaque lot a son logId ; les refus sont nommés. */
export interface ActorContactsExportResult {
  rows: Map<string, ActorContactsRow[]>;
  exportRunId: string;
  logIds: string[];
  authorizedObjectIds: string[];
  deniedObjectIds: string[];
}

export async function exportActorContacts(
  _ids: string[],
  _purpose: string,
  _opts: { batchSize?: number; signal?: AbortSignal } = {},
): Promise<ActorContactsExportResult> {
  // Tâche 16 branche le RPC api.export_actor_contacts (migration 16t). D'ici là :
  // refuser explicitement plutôt que rendre un export silencieusement vide.
  throw new Error("Export des coordonnées d'acteur indisponible (migration 16t non déployée).");
}
