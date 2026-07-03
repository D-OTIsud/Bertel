/** Rubrique « Publication & modération » — cycle de vie de la fiche (brouillon →
 *  publiée → hors ligne/archivée → suppression définitive) et modération des
 *  suggestions terrain. Vérifié contre `SectionPublication.tsx` (§21 « Publication
 *  & cycle de vie » — boutons Publier/Dépublier/Archiver/Restaurer/Supprimer
 *  définitivement, confirmation obligatoire par action), `status-actions.ts`
 *  (copie exacte des confirmations), `DeleteObjectModal.tsx` (suppression
 *  définitive : superuser, fiche déjà archivée, saisie du nom exact, irréversible),
 *  `ModerationPage.tsx` (diff avant/après, Approuver/Rejeter, motif de refus
 *  obligatoire), `Sidebar.tsx` (badge de compteur sur l'entrée Modération), et
 *  CLAUDE.md § Write-path authorization / § Suppression définitive (§108) /
 *  § Explorer — non-published visibility. */
import type { FaqEntry } from './types';

export const PUBLICATION_FAQ: FaqEntry[] = [
  {
    id: 'publier-fiche',
    rubrique: 'publication',
    question: 'Comment publier une fiche ?',
    keywords: ['publier', 'en ligne', 'visible', 'diffuser'],
    related: ['editeur-blocages', 'statuts-fiche'],
    answer: `Dans l'éditeur, la section **Publication** (fin de la fiche) affiche le statut courant et les actions possibles. Cliquez sur **« Publier »** : une **confirmation explicite** s'affiche avant que la fiche devienne visible publiquement sur le site et dans l'Explorer.

**Il faut le droit de publication.** Sans ce droit, les actions de cycle de vie ne sont pas accessibles — voyez l'administrateur de votre organisation.

**Si la publication est bloquée**, la fenêtre de blocages liste précisément ce qui manque (champ obligatoire, tracé non importé…) — corrigez puis réessayez.`,
  },
  {
    id: 'statuts-fiche',
    rubrique: 'publication',
    question: 'Brouillon, publiée, hors ligne, archivée : qui voit quoi ?',
    keywords: ['statut', 'brouillon', 'publiée', 'archivée', 'masquée'],
    related: ['explorer-brouillons', 'publier-fiche'],
    answer: `Quatre statuts possibles pour une fiche :

- **Brouillon** : visible uniquement par les membres de votre organisation ayant le droit de modifier des fiches.
- **Publiée** : visible par tout le monde, sur le site et dans l'Explorer.
- **Hors ligne** (dépubliée) : retirée du site public mais reste modifiable et republiable à tout moment.
- **Archivée** : retirée de l'Explorer, restaurable plus tard.

**Jamais dans l'Explorer** : les fiches hors ligne ou archivées n'apparaissent ni dans la recherche ni dans les filtres, quel que soit votre rôle.`,
  },
  {
    id: 'archiver-fiche',
    rubrique: 'publication',
    question: 'Comment archiver une fiche (fermeture, saison terminée) ?',
    keywords: ['archiver', 'fermer', 'retirer', 'désactiver'],
    related: ['statuts-fiche', 'supprimer-fiche'],
    answer: `Dans la section **Publication** de l'éditeur, cliquez sur **« Archiver »**. La fiche est **retirée de l'Explorer**, mais l'action reste **réversible** : un bouton « Restaurer » permet de la ramener en brouillon (ou hors ligne, si elle avait déjà été publiée).

**Quand archiver.** Un établissement fermé, une offre qui n'existe plus, une fiche créée par erreur mais qu'on souhaite garder tracée.

**Étape préalable à la suppression définitive** : une fiche doit être archivée avant de pouvoir être supprimée pour de bon.`,
  },
  {
    id: 'supprimer-fiche',
    rubrique: 'publication',
    question: 'Comment supprimer définitivement une fiche ?',
    keywords: ['supprimer', 'effacer', 'définitif', 'retirer'],
    related: ['archiver-fiche', 'signaler-doublon'],
    answer: `La suppression définitive est **réservée aux comptes superuser** — un administrateur d'organisation ne peut pas la déclencher.

**Préalable.** La fiche doit déjà être **archivée**. Le bouton **« Supprimer définitivement »** n'apparaît dans la section Publication que dans ce cas.

**Confirmation.** Une fenêtre demande de **saisir le nom exact de la fiche** pour valider — pas de simple case à cocher.

**Attention, IRRÉVERSIBLE.** Toutes les données associées (photos, vidéos, description, relations, tarifs, horaires, documents…) sont définitivement effacées. Aucune restauration possible après coup.`,
  },
  {
    id: 'moderation-suggestions',
    rubrique: 'publication',
    question: 'Pourquoi mes modifications passent-elles « en modération » ?',
    keywords: ['modération', 'suggestion', 'attente', 'validation'],
    related: ['moderer', 'editeur-enregistrer'],
    answer: `Si votre compte n'a pas le **droit d'écriture directe** sur la donnée canonique d'une fiche, votre enregistrement ne modifie pas la fiche tout de suite : il crée une **suggestion**, soumise à validation par un modérateur de l'organisation publicatrice.

**Vous gardez la visibilité** sur ces suggestions : leur statut (en attente, approuvée, refusée) reste consultable une fois soumises.`,
  },
  {
    id: 'moderer',
    rubrique: 'publication',
    question: 'Comment approuver ou rejeter des suggestions de modification ?',
    keywords: ['modérer', 'approuver', 'rejeter', 'suggestions'],
    related: ['moderation-suggestions'],
    answer: `Le module **Modération** affiche chaque suggestion en **vue avant / après** (diff), fiche et champ concernés, auteur et date.

- **Approuver** : la modification est appliquée à la fiche, après confirmation.
- **Rejeter** : un **motif de refus est obligatoire** — il est conservé et communiqué.

**Repérer les suggestions en attente.** Un **badge de compteur** sur l'entrée Modération du menu indique combien de suggestions attendent votre décision.`,
  },
  {
    id: 'signaler-doublon',
    rubrique: 'publication',
    question: 'J\'ai repéré un doublon publié, que faire ?',
    keywords: ['doublon', 'deux fois', 'fusion', 'signaler'],
    related: ['supprimer-fiche', 'choisir-doublon'],
    answer: `**Ne supprimez pas la fiche vous-même.** La fusion ou l'archivage d'un doublon est un **arbitrage** qui doit passer par l'OTI, pas une décision individuelle — une fiche supprimée à tort perd tout son historique.

**Signalez le doublon à l'OTI**, en précisant les deux fiches concernées : la décision (fusion, archivage de l'une des deux) sera prise après vérification des références entrantes. Voir la rubrique « Choisir le bon type » pour les critères qui aident à repérer un doublon.`,
  },
];
