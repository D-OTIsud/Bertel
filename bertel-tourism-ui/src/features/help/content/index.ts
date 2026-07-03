/** Concaténation de TOUTES les rubriques — chaque tâche de contenu ajoute son import.
 *  L'ordre suit FAQ_RUBRIQUES (affichage) ; l'intégrité est gardée par content-integrity.test. */
import type { FaqEntry } from './types';
import { CREER_OBJET_FAQ } from './creer-objet';

export const ALL_FAQ_ENTRIES: FaqEntry[] = [
  ...CREER_OBJET_FAQ,
];
