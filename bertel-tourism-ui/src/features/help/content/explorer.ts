/** Rubrique « Explorer & filtres » — recherche, filtres, vues, fiche, partage,
 *  brouillons, pastille « Ouvert », impression. Vérifié contre
 *  `src/components/explorer/*` (ExplorerViewSwitch, FiltersPanel, ResultCardView,
 *  SelectionBar, selection-print), `useExplorerUrlSync.ts` / `useExplorerContextSync.ts`
 *  (`?fiche=`), `object-drawer/*` (tiroir en lecture seule), et CLAUDE.md
 *  § Explorer — non-published visibility (brouillons de l'ORG de l'utilisateur
 *  uniquement, si son compte peut éditer ; archivé/masqué jamais montrés) +
 *  mémoire open-status-pill-tristate §133 (jamais `Boolean(open_now)`). */
import type { FaqEntry } from './types';

export const EXPLORER_FAQ: FaqEntry[] = [
  {
    id: 'explorer-recherche',
    rubrique: 'explorer',
    question: 'Retrouver une fiche par son nom ?',
    keywords: ['chercher', 'retrouver', 'nom', 'recherche'],
    related: ['palette-commandes', 'explorer-filtres'],
    answer: `Deux façons de chercher une fiche par son nom :

- **La recherche globale de l'Explorer** : le champ de recherche interroge à la fois le nom et le contenu des fiches.
- **La palette de commandes** (Ctrl/⌘ + K), accessible depuis n'importe quel écran de l'application, pas seulement l'Explorer.

**Astuce.** Si vous êtes déjà ailleurs dans l'app (CRM, Dashboard…), la palette est plus rapide que d'aller ouvrir l'Explorer.`,
  },
  {
    id: 'explorer-filtres',
    rubrique: 'explorer',
    question: 'Filtrer par catégorie et sous-catégorie ?',
    keywords: ['filtre', 'catégorie', 'sous-catégorie', 'affiner'],
    related: ['explorer-recherche', 'explorer-brouillons'],
    answer: `Le volet de filtres de l'Explorer présente les **catégories** en rangées à cocher ; ouvrez une catégorie pour affiner avec ses **sous-catégories**, affichées sous forme de chips à sélectionner.

**Les filtres se cumulent.** Catégorie, sous-catégorie et les autres filtres du volet (accessibilité, durabilité, animaux, ouvert maintenant…) s'appliquent tous ensemble — les résultats sont l'intersection de vos choix.

**Piège.** Sélectionner une sous-catégorie d'un type que vous aviez décoché le réintègre automatiquement dans la sélection — sinon le croisement type/sous-catégorie ne renverrait jamais de résultat.`,
  },
  {
    id: 'explorer-vues',
    rubrique: 'explorer',
    question: 'Passer de la liste à la carte ou au tableau ?',
    keywords: ['carte', 'liste', 'tableau', 'vue', 'affichage'],
    related: ['explorer-filtres', 'explorer-fiche'],
    answer: `Le sélecteur de vue de l'Explorer propose quatre modes : **Liste**, **Table** (vue dense en colonnes), **Carte** et **Split** (liste et carte côte à côte).

**Sur la carte**, les itinéraires (randonnées, parcours) affichent leur **tracé** en plus de leur marqueur.

**Aucun mode n'est « le bon »** : la Table convient pour comparer beaucoup de fiches, la Carte pour une lecture géographique, le Split pour naviguer sans perdre le contexte.`,
  },
  {
    id: 'explorer-fiche',
    rubrique: 'explorer',
    question: 'Consulter une fiche sans la modifier ?',
    keywords: ['consulter', 'détail', 'fiche', 'panneau'],
    related: ['explorer-vues', 'explorer-partager-fiche'],
    answer: `Cliquez sur une fiche (dans la liste, le tableau ou sur la carte) : un **panneau de détail** s'ouvre en lecture seule, avec l'essentiel de la fiche (description, photos, contacts, localisation…).

**Pour modifier**, utilisez le bouton **« Modifier »** du panneau : il vous envoie vers l'**éditeur complet** de la fiche. Le panneau lui-même ne permet aucune saisie — c'est une vue de consultation, pas un mini-éditeur.`,
  },
  {
    id: 'explorer-partager-fiche',
    rubrique: 'explorer',
    question: 'Partager un lien direct vers une fiche ?',
    keywords: ['partager', 'lien', 'url', 'envoyer'],
    related: ['explorer-fiche'],
    answer: `Quand une fiche est ouverte dans le panneau de détail, l'**adresse de la page** (URL) porte automatiquement son identifiant. **Copier l'adresse du navigateur suffit** : la personne qui l'ouvre retrouve directement la même fiche, avec le panneau déjà ouvert.

Ce lien fonctionne aussi bien pour un collègue connecté à l'application que dans un e-mail ou un message.`,
  },
  {
    id: 'explorer-brouillons',
    rubrique: 'explorer',
    question: 'Pourquoi je vois des fiches « brouillon » ?',
    keywords: ['brouillon', 'draft', 'non publié', 'visible'],
    related: ['explorer-filtres', 'roles-vue-modules'],
    answer: `Vous ne voyez que les **brouillons de votre propre organisation**, et uniquement si votre compte a le droit de **modifier des fiches** (création, édition ou publication). Un lecteur simple de votre organisation ne les voit pas, même si la fiche existe déjà en base.

**Jamais montrées dans l'Explorer**, quel que soit votre rôle : les fiches **archivées** ou **masquées**. Ces statuts sont volontairement exclus de la recherche et des filtres.`,
  },
  {
    id: 'explorer-ouvert',
    rubrique: 'explorer',
    question: 'Que signifie la pastille « Ouvert » ?',
    keywords: ['ouvert', 'fermé', 'horaires', 'pastille'],
    related: ['explorer-filtres'],
    answer: `La pastille est calculée automatiquement à partir des **horaires d'ouverture** saisis sur la fiche, comparés à l'heure actuelle.

**Pas de pastille = pas de donnée.** Si aucun horaire n'a été renseigné, aucune pastille ne s'affiche — l'absence de pastille ne signifie **jamais** « fermé » : c'est une information manquante, pas un statut négatif par défaut.

**Pastille visible** : « Ouvert » si l'établissement est actuellement ouvert selon ses horaires (y compris un établissement déclaré « ouvert sans horaire »).`,
  },
  {
    id: 'explorer-imprimer',
    rubrique: 'explorer',
    question: 'Imprimer une sélection de fiches ?',
    keywords: ['imprimer', 'sélection', 'carnet', 'pdf'],
    related: ['explorer-vues', 'listes-creer'],
    answer: `Sélectionnez plusieurs fiches dans l'Explorer (cases à cocher de la liste ou du tableau) : une barre d'actions apparaît, avec le bouton **« Imprimer »**.

**Ce que vous obtenez.** Chaque fiche sélectionnée devient une **carte « carnet »** (photo, accroche, coordonnées, contacts publics) prête à imprimer.

**Pour une sélection que vous réutilisez souvent**, préférez créer une liste durable plutôt que de ressélectionner à chaque fois — voir le module dédié aux listes et à l'impression.`,
  },
];
