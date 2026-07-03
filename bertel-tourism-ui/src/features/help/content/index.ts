/** Concaténation de TOUTES les rubriques — chaque tâche de contenu ajoute son import.
 *  L'ordre suit FAQ_RUBRIQUES (affichage) ; l'intégrité est gardée par content-integrity.test. */
import type { FaqEntry } from './types';
import { DEMARRER_FAQ } from './demarrer';
import { CREER_OBJET_FAQ } from './creer-objet';
import { CHOISIR_TYPE_FAQ } from './choisir-type';
import { EXPLORER_FAQ } from './explorer';
import { EDITEUR_FAQ } from './editeur';
import { PUBLICATION_FAQ } from './publication';

export const ALL_FAQ_ENTRIES: FaqEntry[] = [
  ...DEMARRER_FAQ,
  ...CREER_OBJET_FAQ,
  ...CHOISIR_TYPE_FAQ,
  ...EXPLORER_FAQ,
  ...EDITEUR_FAQ,
  ...PUBLICATION_FAQ,
];
