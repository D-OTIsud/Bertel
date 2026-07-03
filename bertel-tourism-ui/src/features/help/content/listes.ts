/** Rubrique « Listes & impression » — sélections durables réutilisables (module Listes),
 *  distinctes des sélections ponctuelles de l'Explorer. Vérifié contre `ListsManageView.tsx`
 *  (création, statuts « Lien actif »…), `ListComposeView.tsx` (palette d'ajout, enregistrement
 *  automatique, boutons Imprimer / Envoyer / Partager par lien, carte récap), `OtiTemplate.tsx`
 *  / `OtiCarnetCard` (rendu carnet imprimé), `OtiMapRecap.tsx` (carte réelle MapLibre), et
 *  mémoire §134-148 (module Listes, impression, carte récap réelle). */
import type { FaqEntry } from './types';

export const LISTES_FAQ: FaqEntry[] = [
  {
    id: 'listes-creer',
    rubrique: 'listes',
    question: 'Créer une liste de fiches à réutiliser ?',
    keywords: ['liste', 'sélection', 'créer', 'regrouper'],
    related: ['listes-ajouter', 'explorer-imprimer'],
    answer: `Le module **Listes** sert à construire des **sélections durables** de fiches — à la différence d'une sélection ponctuelle dans l'Explorer, une liste garde son contenu d'une visite à l'autre.

**Créer une liste.** Cliquez sur **« Nouvelle liste »** : elle est créée immédiatement, vide, prête à recevoir des fiches. **Renommez-la** ensuite depuis l'écran de composition — pas de champ nom à remplir à la création.

**À quoi ça sert.** Préparer à l'avance une sélection pour un public donné (une thématique, un séjour type) plutôt que de ressélectionner les mêmes fiches à chaque impression ou envoi.`,
  },
  {
    id: 'listes-ajouter',
    rubrique: 'listes',
    question: 'Ajouter des fiches à une liste ?',
    keywords: ['ajouter', 'liste', 'fiche', 'palette'],
    related: ['listes-creer', 'listes-imprimer'],
    answer: `Depuis l'écran de composition de la liste, ouvrez la **palette d'ajout** : elle propose une **recherche** parmi les fiches pour retrouver rapidement celle que vous voulez inclure.

**Enregistrement automatique.** Chaque fiche ajoutée est **sauvegardée immédiatement** — pas de bouton « Enregistrer » à part, la liste reflète toujours son contenu réel.

**Retirer une fiche** fonctionne de la même façon : l'action est prise en compte tout de suite.`,
  },
  {
    id: 'listes-imprimer',
    rubrique: 'listes',
    question: 'Imprimer une liste (carnet) ?',
    keywords: ['imprimer', 'carnet', 'pdf', 'papier'],
    related: ['listes-carte', 'explorer-imprimer'],
    answer: `Dans l'écran de composition, le bouton **« Imprimer »** lance l'impression du navigateur. Chaque fiche de la liste devient une **carte « carnet »** (photo, accroche, coordonnées) mise en page pour le papier.

**Pied de page numéroté.** L'impression porte un pied de page avec le numéro de page sur le total (par exemple « OTI du Sud · 2/5 ») — repérage facile pour un carnet à plusieurs pages.

**Astuce.** Utilisez les onglets de canal (Email / PDF / Lien) pour prévisualiser le rendu avant d'imprimer.`,
  },
  {
    id: 'listes-carte',
    rubrique: 'listes',
    question: 'La carte récapitulative d\'une liste ?',
    keywords: ['carte', 'récap', 'points', 'localisation'],
    related: ['listes-imprimer'],
    answer: `La composition d'une liste affiche une **carte récapitulative réelle** : les fiches de la liste sont positionnées à leurs **coordonnées géographiques** effectives, pas des repères décoratifs.

**À l'impression**, cette carte est incluse dans le rendu carnet — un aperçu géographique de la sélection accompagne les cartes détaillées.`,
  },
  {
    id: 'listes-partager',
    rubrique: 'listes',
    question: 'Partager ou envoyer une liste ?',
    keywords: ['partager', 'envoyer', 'transmettre', 'lien'],
    related: ['listes-imprimer', 'listes-creer'],
    answer: `Deux façons de transmettre une liste sans passer par le papier :

- **« Envoyer »** : envoie la liste par e-mail au destinataire renseigné.
- **« Partager par lien »** : active un **lien public** vers la liste (copiable en un clic) ; vous pouvez le désactiver à tout moment depuis la fenêtre de partage.

**Ces trois canaux se cumulent.** Imprimer, envoyer par e-mail et partager par lien ne s'excluent pas : choisissez celui qui convient au moment, la liste elle-même ne change pas.`,
  },
];
