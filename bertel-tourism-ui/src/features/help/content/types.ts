/**
 * FAQ « Aide » (spec docs/superpowers/specs/2026-07-03-faq-aide-design.md).
 * Le contenu vit dans le repo : chaque rubrique = un module TS exportant des FaqEntry[].
 * Réponses en Markdown, sous-ensemble MarkdownContent (gras/italique/listes/citation/liens
 * https|mailto) — JAMAIS de HTML brut, pas de titres. Renvois internes via `related`
 * (un lien Markdown relatif serait neutralisé par SafeLink), rendus par la page.
 */

export const FAQ_RUBRIQUES = [
  { id: 'demarrer', label: 'Démarrer & compte' },
  { id: 'creer-objet', label: 'Créer une fiche' },
  { id: 'choisir-type', label: 'Choisir le bon type' },
  { id: 'explorer', label: 'Explorer & filtres' },
  { id: 'pilotage', label: 'Dashboard & modules' },
  { id: 'editeur', label: 'Éditer une fiche' },
  { id: 'publication', label: 'Publication & modération' },
  { id: 'listes', label: 'Listes & impression' },
  { id: 'crm', label: 'CRM' },
  { id: 'equipe', label: 'Équipe & rôles' },
  { id: 'reglages', label: 'Réglages & RGPD' },
] as const;

export type FaqRubriqueId = (typeof FAQ_RUBRIQUES)[number]['id'];

export interface FaqEntry {
  /** Slug stable et unique — ancre du deep-link `?question=<id>`. Format ^[a-z0-9-]+$. */
  id: string;
  rubrique: FaqRubriqueId;
  /** Formulation « voix de l'agent » (ex. « Je veux créer un artisan… »). */
  question: string;
  /** Markdown (sous-ensemble MarkdownContent). Compact : 5–15 lignes. */
  answer: string;
  /** Vocabulaire MÉTIER tapé réellement (« gîte », « atelier »…) — poids fort en recherche. */
  keywords: string[];
  /** Codes object_type concernés — badges UI + invariant de couverture TYPE_ARCHETYPES. */
  types?: string[];
  /** « Voir aussi » : ids d'autres entrées, rendus par la page comme boutons. */
  related?: string[];
  /** Application routes covered by this help entry; not rendered in the UI. */
  routes?: string[];
}
