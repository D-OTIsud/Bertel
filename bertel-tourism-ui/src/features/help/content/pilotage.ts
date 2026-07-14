/** Rubrique « Dashboard & modules » — tableau de bord, filtres partagés, onglet activité
 *  à venir, modules Audits/Publications en démonstration. Vérifié contre
 *  `DashboardPage.tsx`, `DashboardTabs`, `dashboard-filter-store`, `AuditsPage.tsx`,
 *  `PublicationsPage.tsx`, `utils/features.ts` (`isDemoOnlyModule`). */
import type { FaqEntry } from './types';

export const PILOTAGE_FAQ: FaqEntry[] = [
  {
    id: 'dashboard-comprendre',
    rubrique: 'pilotage',
    question: 'À quoi sert le Dashboard ?',
    keywords: ['dashboard', 'tableau de bord', 'indicateurs', 'scorecard', 'qualité', 'offre'],
    routes: ['/dashboard'],
    related: ['dashboard-filtrer', 'dashboard-activite'],
    answer: `Le **Dashboard** donne une vue d'ensemble du réseau de fiches : des **cartes indicateurs** (scorecards) en haut résument les volumes clés du périmètre filtré.

Deux onglets structurent l'analyse :

- **Qualité** : répartition par type, **complétude** des fiches et **actualisation** (fraîcheur des mises à jour).
- **Offre** : répartition **par commune** et synthèse des **distinctions** (labels, classements…).

Ces vues aident à repérer les trous de contenu et les fiches à remettre à jour, sans ouvrir l'Explorer fiche par fiche.`,
  },
  {
    id: 'dashboard-filtrer',
    rubrique: 'pilotage',
    question: 'Filtrer le Dashboard comme dans l\'Explorer ?',
    keywords: ['filtre', 'période', 'dashboard', 'périmètre', 'commune', 'type'],
    routes: ['/dashboard'],
    related: ['dashboard-comprendre', 'explorer-filtres'],
    answer: `Oui. Le Dashboard dispose d'une **barre latérale de filtres** calquée sur l'Explorer : types d'objets, communes, taxonomies, facettes spécifiques selon le type sélectionné, etc.

Vous pouvez aussi restreindre une **période de mise à jour** (dates de dernière modification). **Tous les widgets du Dashboard** (scorecards, tableaux, graphiques) partagent ces mêmes filtres — changer le périmètre met à jour l'ensemble de la page d'un coup.`,
  },
  {
    id: 'dashboard-activite',
    rubrique: 'pilotage',
    question: 'L\'onglet « Activité équipe » du Dashboard ?',
    keywords: ['activité', 'équipe', 'vélocité', 'contributeurs', 'modération'],
    routes: ['/dashboard'],
    related: ['dashboard-comprendre', 'moderer'],
    answer: `L'onglet **Activité équipe** est **en cours de conception** : vélocité de contribution, contributeurs actifs et suivi de modération arriveront dans un **prochain lot**.

Pour l'instant, la page affiche un message « À venir » — les onglets **Qualité** et **Offre** sont pleinement opérationnels.`,
  },
  {
    id: 'modules-audits-publications',
    rubrique: 'pilotage',
    question: 'Les modules Audits et Publications sont-ils disponibles ?',
    keywords: ['audit', 'publication', 'export', 'indesign', 'démo', 'aperçu', 'maquette'],
    related: ['publier-fiche', 'listes-imprimer'],
    answer: `**Audits** et **Publications** sont des **modules de démonstration / aperçu** : ils illustrent le futur parcours terrain (checklist auditeur, signalement) et le futur chemin de fer éditorial (brief, mise en page, export).

**En production (hors mode démo)**, ces entrées sont **masquées du menu** — ils ne sont pas encore des produits finis. Ne comptez pas sur la soumission d'audit terrain, l'export InDesign ni l'export CSV depuis ces écrans aujourd'hui.

Pour la publication réelle d'une fiche ou l'impression de sélections, utilisez les modules **Publication** (éditeur) et **Listes**.`,
  },
];
