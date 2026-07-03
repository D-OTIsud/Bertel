/** Rubrique « Choisir le bon type » — 9 arbitrages en arbre de décision entre types
 *  proches (frontières COM/ACT/PRD, HLO/RVA, PCU/LOI, PNA/LOI, FMA/ACT, ASC/ACT,
 *  PRD/COM, marchés COM/FMA, ORG/ACTOR) + un rappel anti-doublon. Vérifié contre
 *  `docs/research/type-gap-analysis-2026-06-11.md` (§57, règles d'arbitrage) et
 *  `CLAUDE.md` § ORG vs ACTOR / Standard ACT attachment pattern. Gabarit : intro
 *  courte, branches à puces, **Piège.** final. Markdown only, voix « vous ». */
import type { FaqEntry } from './types';

export const CHOISIR_TYPE_FAQ: FaqEntry[] = [
  {
    id: 'choisir-artisan',
    rubrique: 'choisir-type',
    question: 'Je veux créer un artisan : quel type de fiche choisir ?',
    keywords: ['artisan', 'artisanat', 'atelier', 'créateur', 'boutique', 'savoir-faire', 'métier d’art', 'démonstration', 'stage', 'fabrication'],
    types: ['COM', 'ACT', 'PRD'],
    related: ['creer-com', 'creer-act', 'creer-prd', 'choisir-org-actor'],
    answer: `Le bon type dépend de **ce que le visiteur vient faire** chez l'artisan :

- **Il achète, c'est tout** (boutique, échoppe, stand permanent) → **Commerce (COM)**, sous-catégorie « Artisanat / produits locaux ». Peu importe que l'artisan produise lui-même ou revende : tant que l'offre touristique est la *vente*, c'est un commerce.
- **Il participe à un atelier, un stage ou une démonstration encadrée** (sur réservation, avec un animateur) → **Activité encadrée (ACT)**. La fiche ACT porte la *prestation* ; l'artisan qui l'anime est un **acteur** (opérateur) rattaché à la fiche — on ne crée jamais d'organisation pour lui.
- **Il visite une exploitation qui produit sur place** (vanilleraie, distillerie, torréfacteur… avec vente directe) → **Producteur (PRD)**.
- **Les deux** (boutique à l'année + ateliers réguliers) → **deux fiches liées** : un COM pour la boutique, une ACT pour l'atelier, reliées dans la section Relations de l'éditeur.

**Piège.** Ne classez pas un artisan en ACT « parce qu'il fabrique » : la fabrication n'est une activité touristique que si le visiteur peut y participer ou y assister dans un cadre organisé.`,
  },
  {
    id: 'choisir-hlo-rva',
    rubrique: 'choisir-type',
    question: 'Gîte, meublé ou résidence de vacances : quel type choisir ?',
    keywords: ['gîte', 'meublé', 'résidence', 'appartement', 'location', 'services collectifs', 'villa'],
    types: ['HLO', 'RVA'],
    related: ['creer-hlo', 'creer-rva'],
    answer: `La question à trancher : **un logement isolé, ou un ensemble avec services collectifs ?**

- **Un logement entier, loué seul, sans réception ni service partagé** (gîte, meublé, villa, bungalow) → **Gîte & meublé (HLO)**. C'est le type le plus courant du territoire.
- **Plusieurs logements gérés par le même exploitant, avec des services collectifs** (accueil, ménage, parfois piscine ou animation) → **Résidence de vacances (RVA)**.
- **Un exploitant avec plusieurs gîtes indépendants, sans service collectif** → toujours HLO, **une fiche par logement** — le nombre de logements ne fait pas basculer en RVA, seuls les services collectifs le font.

**Piège.** Ce doublon existe réellement dans l'import historique : plusieurs fiches créées en HLO ont dû être requalifiées en RVA une fois les services collectifs identifiés. Si vous hésitez, cherchez s'il y a un accueil ou un service partagé — s'il n'y en a pas, restez en HLO.`,
  },
  {
    id: 'choisir-pcu-loi',
    rubrique: 'choisir-type',
    question: 'Musée, site culturel : Patrimoine ou Loisir ?',
    keywords: ['musée', 'patrimoine', 'loisir', 'visite', 'monument', 'culture', 'billetterie'],
    types: ['PCU', 'LOI'],
    related: ['creer-pcu', 'creer-loi'],
    answer: `Le critère est la **nature du site**, pas son caractère payant ou non :

- **Valeur patrimoniale ou culturelle reconnue** (musée, église, monument, site historique) → **Patrimoine (PCU)**. Le musée est rattaché exclusivement à PCU, jamais à LOI — c'est la source de vérité unique pour ce type de site.
- **Équipement récréatif marchand sans valeur patrimoniale** (parc à thème, accrobranche, plaine de jeux) → **Loisir (LOI)**.

**Piège.** Une billetterie ne suffit pas à orienter vers LOI : un musée payant reste en PCU. C'est la nature du site (patrimonial vs. récréatif) qui tranche, pas le modèle économique.`,
  },
  {
    id: 'choisir-pna-loi',
    rubrique: 'choisir-type',
    question: 'Cascade, point de vue, parc : Site naturel ou Loisir ?',
    keywords: ['cascade', 'nature', 'parc', 'point de vue', 'site naturel', 'aménagement', 'billetterie'],
    types: ['PNA', 'LOI'],
    related: ['creer-pna', 'creer-loi'],
    answer: `Le critère est le **degré d'aménagement marchand** du site :

- **Milieu naturel, généralement en accès libre** (cascade, point de vue, forêt, belvédère) → **Site naturel (PNA)**.
- **Aménagement récréatif payant construit sur ou autour d'un site naturel** (parc animalier, jardin payant avec billetterie) → **Loisir (LOI)**.

**Piège.** Un site naturel qui installe une billetterie ou des aménagements marchands (parcours, accès contrôlé) bascule souvent vers Loisir (LOI) — ne le laissez pas par défaut en PNA seulement parce qu'il s'agit d'un cadre naturel.`,
  },
  {
    id: 'choisir-fma-act',
    rubrique: 'choisir-type',
    question: 'Événement ponctuel ou activité récurrente : Fête/manifestation ou Activité encadrée ?',
    keywords: ['événement', 'festival', 'dates', 'récurrent', 'manifestation', 'occurrence', 'réservation'],
    types: ['FMA', 'ACT'],
    related: ['creer-fma', 'creer-act'],
    answer: `Le critère est la **présence de dates d'édition** :

- **L'offre a une ou plusieurs dates précises** (une édition, une série d'occurrences datées) → **Fête / manifestation (FMA)**. Sans date de début ni occurrence renseignée, la publication est bloquée.
- **La prestation est réservable en continu, toute l'année, sans dates d'édition** → **Activité encadrée (ACT)**.

**Piège.** Un événement « permanent » sans dates n'est pas le bon modèle pour FMA — s'il n'y a pas de dates à saisir, c'est probablement une ACT (ou une ASC) mal classée en FMA.`,
  },
  {
    id: 'choisir-asc-act',
    rubrique: 'choisir-type',
    question: 'Activité libre ou encadrée : ASC ou ACT ?',
    keywords: ['activité', 'encadré', 'autonomie', 'spot', 'prestation', 'moniteur', 'réservation'],
    types: ['ASC', 'ACT'],
    related: ['creer-asc', 'creer-act'],
    answer: `Le critère est **qui encadre, et comment** — les deux types partagent d'ailleurs le même archétype d'éditeur (mêmes sections) :

- **Pratique en autonomie ou encadrement léger** (spot de randonnée aquatique, sortie découverte informelle) → **Activité (ASC)**.
- **Prestation commerciale encadrée, avec un opérateur qui organise et commercialise** (stage, sortie guidée, atelier avec moniteur, réservation obligatoire) → **Activité encadrée (ACT)**.

**Piège.** La frontière n'est pas toujours évidente à l'œil : demandez-vous s'il existe un opérateur qui vend et encadre la prestation. S'il n'y en a pas, c'est ASC ; s'il y en a un, c'est ACT — pas la difficulté physique ni le matériel qui tranchent.`,
  },
  {
    id: 'choisir-prd-com',
    rubrique: 'choisir-type',
    question: 'Producteur ou commerce : quel type pour une exploitation qui vend ?',
    keywords: ['producteur', 'revendeur', 'vente directe', 'boutique', 'exploitation', 'dégustation'],
    types: ['PRD', 'COM'],
    related: ['creer-prd', 'creer-com'],
    answer: `Le critère est **qui a produit ce qui est vendu** :

- **L'exploitation produit sur place ce qu'elle vend**, avec un accueil du public (visite, dégustation, vente directe sur site) → **Producteur (PRD)**.
- **Elle revend des produits qu'elle n'a pas produits** (même s'ils sont locaux) → **Commerce (COM)**.
- **Cas mixte** (elle produit une partie, revend le reste) → retenez ce qui **domine l'offre visiteur** : si la visite/dégustation de la production est le cœur de l'expérience, PRD ; si c'est avant tout une boutique, COM.

**Piège.** Ne confondez pas avec les cas voisins : des repas servis sur place comme activité principale relèvent de Restaurant (RES), une visite guidée commercialisée par un tiers relève d'Activité encadrée (ACT) — voir aussi la fiche « artisan » pour ce dernier cas.`,
  },
  {
    id: 'choisir-marche',
    rubrique: 'choisir-type',
    question: 'Un marché forain ou couvert : quel type choisir ?',
    keywords: ['marché', 'forain', 'marché couvert', 'étals', 'brocante', 'foire'],
    types: ['COM', 'FMA'],
    related: ['creer-com', 'creer-fma'],
    answer: `La règle d'arbitrage retenue distingue le **lieu récurrent** de l'**édition datée** :

- **Marché forain, couvert ou brocante qui se tient chaque semaine au même endroit** (horaires hebdomadaires réguliers) → **Commerce (COM)**. Le module horaires du COM porte nativement la récurrence hebdomadaire — inutile de créer une fiche événement pour un rendez-vous qui revient chaque semaine.
- **Édition ponctuelle et datée** (marché de Noël, foire annuelle) → **Fête / manifestation (FMA)**, avec ses dates ou occurrences renseignées.

**Piège.** Ne créez pas de fiche FMA pour un marché hebdomadaire « habituel » sous prétexte qu'il a un jour fixe : un jour fixe qui revient toutes les semaines est un horaire, pas une édition — c'est un COM.`,
  },
  {
    id: 'choisir-org-actor',
    rubrique: 'choisir-type',
    question: 'Organisation ou acteur : qui est qui dans une fiche ?',
    keywords: ['organisation', 'acteur', 'opérateur', 'prestataire', 'structure', 'org', 'actor'],
    types: ['ACT'],
    related: ['creer-act', 'choisir-artisan'],
    answer: `Ce ne sont pas des types de fiches concurrents : **ORG** et **ACTOR** répondent à deux questions différentes.

- **ORG** = la structure institutionnelle qui **publie** la fiche (par exemple l'OTI du Sud). C'est l'éditeur, jamais l'exécutant de la prestation.
- **ACTOR** = la personne ou l'entreprise qui **opère réellement** la prestation sur le terrain — guide, moniteur, artisan, prestataire commercial. Les acteurs se gèrent depuis le **CRM** et la section **Prestataires** de l'éditeur, pas comme des fiches établissement.

**Piège.** Ne créez jamais une organisation (ORG) pour un prestataire commercial ou opérationnel — c'est un acteur (ACTOR). Créer une ORG par prestataire casserait le modèle : ORG est réservée aux structures institutionnelles éditrices, pas aux opérateurs.`,
  },
  {
    id: 'choisir-doublon',
    rubrique: 'choisir-type',
    question: 'L\'établissement existe peut-être déjà : comment vérifier avant de créer ?',
    keywords: ['doublon', 'existe déjà', 'duplicate', 'vérifier', 'recherche', 'homonyme'],
    related: ['creer-fiche'],
    answer: `Avant de créer une fiche, **cherchez si elle n'existe pas déjà** :

- Utilisez la **recherche globale** de l'Explorer ou la palette de commandes (Ctrl/⌘ + K) avec le nom de l'établissement.
- Pendant la saisie du nom dans le dialogue de création, les fiches au **nom proche** sont automatiquement listées (type et commune affichés) — un clic ouvre la fiche existante au lieu de continuer la création.
- Si vous repérez un doublon déjà **publié**, ne le supprimez pas vous-même : signalez-le à l'OTI pour arbitrage.

**Piège.** Un même nom peut légitimement exister ailleurs sur le territoire (deux gîtes qui portent le même nom de famille, par exemple) — un nom proche n'est un doublon que si l'établissement est réellement le même.`,
  },
];
