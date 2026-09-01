/**
 * Vocabulaire FRANÇAIS des erreurs MOTEUR (PostgreSQL / PostgREST), partagé par les deux bords :
 * les routes `src/app/api/**` qui décident du `detail` qu'elles émettent, et
 * `src/services/api-error.ts` qui traduit ce que le client reçoit. UNE table, pas deux.
 *
 * POURQUOI CE MODULE (revue finale du chantier « tâches CRM », 2026-09-01). `api-error.ts`
 * documentait déjà le défaut sans pouvoir le corriger : son allowlist `CODES_WITH_BUSINESS_DETAIL`
 * affiche le `detail` de `delete_failed` / `erase_failed` VERBATIM, parce que pour `objects/delete`
 * et `rgpd/erase` ce `detail` EST le message métier d'un `RAISE` français — c'est sa raison d'être.
 * Mais trois routes alimentaient le même code avec la sortie BRUTE du moteur : l'utilisateur qui
 * supprimait une pièce jointe lisait « update or delete on table "ref_document" violates foreign
 * key constraint … ». Le correctif ne pouvait pas vivre côté client — l'allowlist ne peut pas
 * deviner laquelle des deux familles elle a en main — il devait aller À LA SOURCE, dans la route.
 *
 * LE DISCRIMINANT EST LE SQLSTATE, JAMAIS LE CONTENU DU TEXTE. Nos propres `RAISE` sortent en
 * `P0001` (ou `22023` pour nos refus de règle métier) et portent des phrases déjà françaises ; les
 * codes de cette table viennent tous du moteur et ne sont destinés à aucun humain. Une heuristique
 * sur le texte (« ça ressemble à du français ») serait exactement la devinette que l'allowlist
 * s'interdit — d'où le contrat : `engineErrorDetail` rend `undefined` pour nos RAISE, il ne les
 * traduit pas et ne les vole pas à la route qui a le droit de les relayer.
 */

/** Vrai en dev/test, faux en production — décide de ce qui part au journal. */
export function isVerboseEnv(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * SQLSTATE PostgreSQL → message FR. Table volontairement courte : ne sont traduits que les codes
 * dont l'utilisateur peut faire quelque chose. Aucun code de `RAISE` maison ici (voir l'en-tête).
 */
export const SQLSTATE_LABELS: Record<string, string> = {
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

/**
 * Codes dont le SENS s'INVERSE quand c'est une suppression qui échoue.
 *
 * `23503` en écriture = « la ligne référencée n'existe pas / plus » ; en suppression = « cette
 * ligne est ENCORE référencée ailleurs ». Servir le libellé d'écriture sur un DELETE dirait à
 * l'utilisateur exactement le contraire de ce qui s'est passé — c'est précisément le cas relevé
 * sur `actor-document` (« violates foreign key constraint » sur `ref_document`).
 */
const DELETE_SQLSTATE_LABELS: Record<string, string> = {
  '23503': "Cet élément est encore utilisé ailleurs — il ne peut pas être supprimé.",
};

export interface EngineErrorOptions {
  /** `'delete'` bascule sur les libellés dont le sens s'inverse pour une suppression. */
  operation?: 'delete' | 'write';
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}

export function readErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}

/**
 * Ce qui part au journal pour un brut moteur. Fonction PURE et exportée pour une raison précise :
 * `next/jest` remplace `process.env.NODE_ENV` par un littéral à la compilation, donc un test qui
 * réécrit la variable à l'exécution ne bascule RIEN. La branche production ne serait jamais
 * exercée — une garde qu'on ne peut pas saboter n'est pas une garde.
 */
export function rawDatabaseErrorFields(error: unknown, verbose: boolean): { code?: string; detail?: string } {
  const code = readErrorCode(error) || undefined;
  return verbose ? { code, detail: readErrorMessage(error) } : { code };
}

/**
 * Journalise un brut moteur. En production, seuls le scope et le code sortent : un message
 * Postgres porte des noms de tables, de contraintes, et parfois la VALEUR qui a échoué.
 */
export function warnRawDatabaseError(scope: string, error: unknown): void {
  console.warn(`[${scope}] erreur moteur non relayée`, rawDatabaseErrorFields(error, isVerboseEnv()));
}

/**
 * `detail` FRANÇAIS affichable pour une erreur venue du MOTEUR, ou `undefined`.
 *
 * `undefined` a un sens précis et voulu : la route omet alors `detail` et le client retombe sur le
 * libellé générique de son code (`delete_failed` → « La suppression a échoué. »). C'est toujours
 * préférable à un pass-through : mieux vaut une phrase générique en français qu'une phrase exacte
 * en anglais nommant des tables internes.
 *
 * Rend `undefined` AUSSI pour nos propres `RAISE` (`P0001` / `22023`) : ce module ne traite que le
 * moteur. Une route qui a le droit de relayer un message métier (voir `CODES_WITH_BUSINESS_DETAIL`
 * dans `api-error.ts`) le fait elle-même, en repli sur ce `undefined`.
 */
export function engineErrorDetail(error: unknown, options: EngineErrorOptions = {}): string | undefined {
  const code = readErrorCode(error);
  if (code) {
    const label = (options.operation === 'delete' ? DELETE_SQLSTATE_LABELS[code] : undefined)
      ?? SQLSTATE_LABELS[code];
    if (label) return label;
  }
  warnRawDatabaseError('db-error', error);
  return undefined;
}
