/** Rubrique « CRM » — module acteur-centré (interactions, tâches, annuaire), distinct
 *  des fiches établissement. Vérifié contre CLAUDE.md § CRM — modèle acteur-centré,
 *  `src/features/crm/*` (CrmInteractionModal — kinds Appel/E-mail/Visite terrain/Note
 *  interne, sujet/ressenti ; CrmTaches — kanban 3 colonnes À faire/En cours/Terminées ;
 *  CrmAnnuaire — filtres serveur sujet/statut/période ; CrmActorModals — Nouvel acteur /
 *  Modifier l'acteur), `src/services/crm.ts` (demand_topic = 20 sujets OTI, crm_sentiment),
 *  et mémoire §61/§63 (pivot acteur-centré, rectifs PO). */
import type { FaqEntry } from './types';

export const CRM_FAQ: FaqEntry[] = [
  {
    id: 'crm-quoi',
    rubrique: 'crm',
    question: 'À quoi sert le module CRM ?',
    keywords: ['crm', 'suivi', 'relation', 'socio-pro'],
    related: ['crm-acteur-vs-fiche', 'crm-annuaire'],
    answer: `Le CRM assure le **suivi relationnel** avec les socio-professionnels du territoire — interactions, tâches de relance, annuaire des contacts. Il est **centré sur les personnes** (les acteurs), pas sur les fiches établissement.

**Ce n'est pas l'Explorer.** L'Explorer gère l'**offre publiée** (les fiches) ; le CRM gère la **relation avec les gens** qui la portent — même si une interaction peut être rattachée à une fiche pour donner le contexte.`,
  },
  {
    id: 'crm-acteur-vs-fiche',
    rubrique: 'crm',
    question: 'Acteur ou fiche : quelle différence ?',
    keywords: ['acteur', 'contact', 'personne', 'gérant'],
    related: ['crm-quoi', 'choisir-org-actor'],
    answer: `Deux notions différentes, souvent confondues :

- **La fiche** (établissement) est **l'offre publiée** : le gîte, le restaurant, l'activité — ce que voit le visiteur dans l'Explorer.
- **L'acteur** est **la personne** : le gérant, l'exploitant, le contact socio-professionnel — géré depuis le CRM, jamais comme une fiche établissement.

**Un acteur peut être lié à plusieurs fiches** (un exploitant qui gère deux gîtes, par exemple) : le CRM suit la personne, pas chaque fiche séparément. Voir aussi la rubrique « Organisation ou acteur » pour la distinction ORG/ACTOR côté fiche.`,
  },
  {
    id: 'crm-interaction',
    rubrique: 'crm',
    question: 'Enregistrer un échange (appel, visite, e-mail) ?',
    keywords: ['interaction', 'appel', 'visite', 'échange', 'note'],
    related: ['crm-acteur-vs-fiche', 'crm-annuaire'],
    answer: `Depuis la fiche de l'acteur (ou depuis un établissement lié), créez une **nouvelle interaction** : quatre types possibles — **Appel**, **E-mail**, **Visite terrain**, **Note interne**.

**Ancrage.** L'interaction est toujours rattachée à un **acteur** ; l'établissement concerné est également requis pour donner le contexte.

**Sujet et ressenti.** Choisissez le **sujet** de l'échange parmi le vocabulaire commun (une vingtaine de sujets métier de l'OTI) et, si utile, le **ressenti** perçu (positif, inquiet…) — de quoi retrouver rapidement de quoi il retournait sans rouvrir chaque note.`,
  },
  {
    id: 'crm-taches',
    rubrique: 'crm',
    question: 'Créer et suivre des tâches ?',
    keywords: ['tâche', 'kanban', 'à faire', 'échéance', 'relance'],
    related: ['crm-interaction', 'crm-annuaire'],
    answer: `L'onglet **Tâches** affiche un **kanban à trois colonnes** : **À faire**, **En cours**, **Terminées**. Faites glisser une carte pour changer son statut, ou utilisez les actions clavier équivalentes.

**Chaque tâche peut être rattachée** à un établissement (contexte) et, optionnellement, à un **acteur** — un clic sur l'un ou l'autre ouvre sa fiche.

**Échéances.** Un badge sur la carte signale sa proximité (aujourd'hui, en retard…), sans jamais masquer les tâches en dehors du tri normal.`,
  },
  {
    id: 'crm-annuaire',
    rubrique: 'crm',
    question: 'Retrouver un socio-professionnel ?',
    keywords: ['annuaire', 'socio-pro', 'coordonnées', 'téléphone'],
    related: ['crm-nouvel-acteur', 'crm-acteur-vs-fiche'],
    answer: `L'onglet **Annuaire** liste les acteurs, filtrable par **sujet**, **statut** et **période** — les compteurs et le dernier contact se recalculent selon vos filtres.

**La fiche acteur** regroupe ce qu'il faut savoir sur la personne : **coordonnées**, identité, historique des interactions et tâches liées, établissements rattachés.

**Recherche par nom** disponible directement dans l'annuaire, en complément des filtres.`,
  },
  {
    id: 'crm-nouvel-acteur',
    rubrique: 'crm',
    question: 'Créer un acteur ou corriger ses coordonnées ?',
    keywords: ['nouvel acteur', 'coordonnées', 'corriger', 'e-mail'],
    related: ['crm-annuaire', 'crm-acteur-vs-fiche'],
    answer: `Depuis l'annuaire, le bouton **« Nouvel acteur »** ouvre un formulaire de création (identité, adresse, canaux de contact).

**Corriger une fiche existante.** Ouvrez l'acteur puis **« Modifier l'acteur »** pour ajuster son identité ou ses canaux (téléphone, e-mail…).

**Piège.** Les coordonnées de l'acteur dans le CRM sont **indépendantes** des contacts publics affichés sur une fiche établissement — corriger l'un ne met pas à jour l'autre automatiquement.`,
  },
];
