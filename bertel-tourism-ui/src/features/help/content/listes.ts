/** Rubrique « Listes & impression » — sélections durables réutilisables (module Listes),
 *  distinctes des sélections ponctuelles de l'Explorer. Vérifié contre `ListsManageView.tsx`
 *  (création, à la une, archives, propositions), `ListComposeView.tsx` (palette d'ajout,
 *  enregistrement automatique, couverture, Imprimer / Envoyer / Partager par lien / Dupliquer,
 *  carte récap), `OtiTemplate.tsx` / `OtiCarnetCard` (rendu carnet imprimé), `OtiMapRecap.tsx`
 *  (carte réelle MapLibre), et cadrage `docs/superpowers/specs/2026-09-07-listes-personnelles-
 *  une-cycle-vie-design.md`. */
import type { FaqEntry } from './types';

export const LISTES_FAQ: FaqEntry[] = [
  {
    id: 'listes-creer',
    rubrique: 'listes',
    question: 'Créer une liste de fiches à réutiliser ?',
    keywords: ['liste', 'sélection', 'créer', 'regrouper'],
    routes: ['/listes'],
    related: ['listes-ajouter', 'listes-une', 'explorer-imprimer'],
    answer: `Le module **Listes** sert à construire des **sélections durables** de fiches — à la différence d'une sélection ponctuelle dans l'Explorer, une liste garde son contenu d'une visite à l'autre. **Tout membre connecté d'une organisation** peut créer une liste, y compris un lecteur.

**Trois points de départ.** Le bouton **« Nouvelle liste »** de l'écran Listes (créée vide, à renommer ensuite) ; **« Créer une liste »** depuis une sélection de fiches dans l'Explorer (liste figée) ; **« ★ Liste dynamique »** depuis des filtres actifs de l'Explorer (liste qui se remet à jour toute seule à chaque ouverture).

**À quoi ça sert.** Préparer à l'avance une sélection pour un public donné (une thématique, un séjour type) plutôt que de ressélectionner les mêmes fiches à chaque impression ou envoi.`,
  },
  {
    id: 'listes-ajouter',
    rubrique: 'listes',
    question: 'Ajouter des fiches à une liste ?',
    keywords: ['ajouter', 'liste', 'fiche', 'palette'],
    related: ['listes-creer', 'listes-imprimer'],
    answer: `Depuis l'écran de composition de la liste, ouvrez la **palette d'ajout** : elle propose une **recherche** parmi les fiches **publiées** pour retrouver rapidement celle que vous voulez inclure (une fiche encore en brouillon n'apparaît pas — une liste ne peut retenir que du publié).

**Enregistrement automatique.** Chaque fiche ajoutée est **sauvegardée immédiatement** — pas de bouton « Enregistrer » à part, la liste reflète toujours son contenu réel. Si une fiche est refusée par l'enregistrement (redevenue brouillon entre-temps), elle est retirée automatiquement et un message l'indique.

**Retirer une fiche** fonctionne de la même façon : l'action est prise en compte tout de suite.

**Lecture seule.** Si vous consultez une liste **à la une** sans en être l'auteur, l'ajout/le retrait de fiches est réservé à un administrateur de votre organisation — vous pouvez toujours l'imprimer, l'envoyer, la partager et la dupliquer.`,
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
    related: ['listes-imprimer', 'listes-creer', 'listes-une'],
    answer: `Deux façons de transmettre une liste sans passer par le papier :

- **« Envoyer »** : envoie la liste par e-mail au destinataire renseigné.
- **« Partager par lien »** : active un **lien public** vers la liste (copiable en un clic).

**Ces trois canaux se cumulent.** Imprimer, envoyer par e-mail et partager par lien ne s'excluent pas : choisissez celui qui convient au moment, la liste elle-même ne change pas.

**Éditeur ou lecteur.** L'auteur (ou un administrateur sur une liste à la une) peut **désactiver** le lien à tout moment depuis la fenêtre de partage. Un lecteur qui utilise une liste à la une peut copier un lien déjà actif, mais ne peut ni le désactiver ni réactiver un lien expiré ou révoqué — un message l'explique le cas échéant.`,
  },
  {
    id: 'listes-une',
    rubrique: 'listes',
    question: 'Proposer ou mettre une liste à la une de mon organisation ?',
    keywords: ['une', 'proposer', 'featured', 'mettre en avant', 'organisation'],
    routes: ['/listes'],
    related: ['listes-creer', 'listes-propositions'],
    answer: `Une liste **à la une** est visible à **tous les membres** de votre organisation depuis l'écran Listes, au-dessus de « Mes listes ».

**Proposer sa liste.** Depuis la composition d'une de vos listes, le bouton **« Proposer à la une »** l'envoie à la validation d'un administrateur ; « Proposition envoyée » s'affiche tant qu'elle attend une réponse.

**Administrateur.** Un administrateur de l'organisation peut mettre **directement** l'une de ses propres listes à la une, et **retirer** n'importe quelle liste actuellement à la une (la vôtre ou celle d'un collègue). Pour accepter ou refuser la proposition d'un collègue, il passe par l'onglet **Propositions**.

**Édition gelée pendant la mise en avant.** Tant qu'une liste est à la une, seul un administrateur peut modifier son contenu — l'auteur d'origine (s'il n'est pas administrateur) garde l'usage (imprimer, envoyer, partager, dupliquer) mais pas l'édition.`,
  },
  {
    id: 'listes-propositions',
    rubrique: 'listes',
    question: 'Examiner les propositions de mise à la une (administrateur) ?',
    keywords: ['propositions', 'accepter', 'refuser', 'administrateur', 'valider'],
    routes: ['/listes'],
    related: ['listes-une'],
    answer: `L'onglet **Propositions** n'apparaît que pour un administrateur de l'organisation ; il liste les listes personnelles proposées par des collègues, avec le nom du proposant (jamais le destinataire de la liste).

**Accepter** met la liste à la une immédiatement. **Refuser** annule la proposition — la liste redevient une simple liste personnelle pour son auteur.

Examiner une proposition donne un accès de **lecture** à son contenu, pas le droit de l'imprimer, l'envoyer, la partager ou la dupliquer : ces actions restent réservées à son auteur ou aux membres une fois la liste effectivement à la une.`,
  },
  {
    id: 'listes-archives',
    rubrique: 'listes',
    question: 'Retrouver et restaurer une liste archivée ?',
    keywords: ['archives', 'archivée', 'restaurer', 'inactive'],
    routes: ['/listes'],
    related: ['listes-creer'],
    answer: `Une liste personnelle **non mise à la une** rejoint automatiquement l'onglet **Archives** après **21 jours** sans modification réelle ni envoi réussi (consulter, imprimer ou partager le lien ne compte pas comme une activité). Une liste à la une n'est jamais archivée tant qu'elle le reste.

**Le lien public n'est pas coupé** par l'archivage : il continue de suivre ses propres règles d'activation/expiration.

**Restaurer.** Depuis l'onglet Archives, le bouton **« Restaurer »** réactive la liste explicitement — elle repart alors pour une nouvelle période active complète.`,
  },
  {
    id: 'listes-dupliquer',
    rubrique: 'listes',
    question: 'Dupliquer une liste ?',
    keywords: ['dupliquer', 'copier', 'dupliquer une liste'],
    related: ['listes-creer', 'listes-une'],
    answer: `Le bouton **« Dupliquer »** (grille ou composition) crée une **copie personnelle indépendante** : nouveau propriétaire (vous), jamais à la une ni proposée, sans le lien de partage ni l'historique d'envoi de l'original. Une liste dynamique reste dynamique (mêmes filtres) ; une liste statique conserve l'ordre et les notes des fiches.

Disponible pour toute liste que vous pouvez utiliser — la vôtre, ou une liste à la une de votre organisation.`,
  },
  {
    id: 'listes-couverture',
    rubrique: 'listes',
    question: 'Choisir la photo de couverture d\'une liste ?',
    keywords: ['couverture', 'photo', 'image', 'hero'],
    related: ['listes-ajouter'],
    answer: `Par défaut, la couverture est **dérivée automatiquement** : la première photo disponible parmi les fiches de la liste.

**Choix explicite.** Dans « Options du rendu », sélectionnez une des photos des fiches de la liste pour la fixer comme couverture. Le bouton **« Automatique »** revient au repli calculé par la fiche la plus adaptée.

**Photo indisponible.** Si l'image ne charge pas, un aplat neutre s'affiche à la place — jamais une icône cassée.`,
  },
];
