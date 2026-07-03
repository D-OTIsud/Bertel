/** Rubrique « Créer une fiche » — 1 entrée générale + 1 fiche par type (les 18 de
 *  TYPE_ARCHETYPES = enum object_type moins ORG). Gabarit fixe (spec) :
 *  **C'est quoi.** / **Quand choisir ce type.** / **Sous-catégorie.** / **Étapes.** / **Pièges.** */
import type { FaqEntry } from './types';

export const CREER_OBJET_FAQ: FaqEntry[] = [
  {
    id: 'creer-fiche',
    rubrique: 'creer-objet',
    question: 'Comment créer une nouvelle fiche ?',
    keywords: ['créer', 'nouvelle fiche', 'ajouter', 'établissement', 'nouveau'],
    // related inter-rubriques : 'choisir-artisan' branché (Task 4) ; 'publier-fiche' (Task 6)
    // — le test d'intégrité interdit un renvoi vers un id absent.
    related: ['choisir-artisan'],
    answer: `**Où.** Bouton **Créer** de l'Explorer, ou palette de commandes (Ctrl/⌘ + K → « Créer une fiche »). Si le bouton n'apparaît pas, votre compte n'a pas le droit de création — voyez l'administrateur de votre organisation.

**Comment.** 1. Choisissez le **type de fiche** (regroupés par famille : hébergement, restaurant, activité, itinéraire, visite, service, événement) — ce choix conditionne les sections de l'éditeur, prenez le temps de vérifier l'arbitrage dans la rubrique « Choisir le bon type ». 2. Saisissez le **nom exact** de l'établissement ou de l'offre. 3. La fiche s'ouvre en **brouillon** dans l'éditeur.

**Ensuite.** Remplissez les sections prioritaires (identité, localisation, contacts, description, photos) puis publiez depuis la section Publication. Un brouillon n'est visible que par votre organisation.`,
  },
  {
    id: 'creer-hlo',
    rubrique: 'creer-objet',
    question: 'Comment créer un gîte ou un meublé de tourisme ?',
    keywords: ['gîte', 'meublé', 'location saisonnière', 'kaz', 'villa', 'bungalow', 'location vacances'],
    types: ['HLO'],
    related: ['creer-fiche', 'choisir-hlo-rva'],
    answer: `**C'est quoi.** Un logement entier loué à la semaine ou à la nuitée (gîte, meublé, villa, bungalow) — type **Gîte & meublé (HLO)**. C'est le type le plus courant du territoire.

**Quand choisir ce type.** Le voyageur loue le logement complet, sans services hôteliers. **Pas ce type si** : chambres à la nuitée avec réception/services → Hôtel (HOT) ; ensemble d'appartements avec services collectifs → Résidence de vacances (RVA) ; emplacements de plein air → Camping (CAMP) ou Hôtellerie de plein air (HPA).

**Étapes.** Créer → type « Gîte & meublé » → nom exact. Dans l'éditeur, renseignez en priorité : localisation, contacts, description, photos, la **capacité** (section Chambres, capacité & séminaire) et les tarifs.

**Pièges.** Le classement en étoiles (meublé de tourisme) se saisit dans Classement & labels — jamais dans le nom de la fiche.`,
  },
  {
    id: 'creer-hot',
    rubrique: 'creer-objet',
    question: 'Comment créer un hôtel ?',
    keywords: ['hôtel', 'chambre', 'nuitée', 'étoiles'],
    types: ['HOT'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un établissement proposant des chambres à la nuitée avec des services hôteliers (réception, ménage…) — type **Hôtel (HOT)**.

**Quand choisir ce type.** Réception et services hôteliers, chambres louées à la nuitée. **Pas ce type si** : logement entier loué sans services → Gîte & meublé (HLO) ; ensemble d'appartements avec services collectifs → Résidence de vacances (RVA).

**Étapes.** Créer → type « Hôtel » → nom exact. Dans l'éditeur, renseignez la **capacité et les chambres** (section Chambres, capacité & séminaire) et le **classement en étoiles** (section Classifications & distinctions).

**Pièges.** Le nombre d'étoiles n'est pas un champ libre : il se déclare comme une classification officielle, avec son statut (accordée, en cours…), pas dans le nom ni la description.`,
  },
  {
    id: 'creer-hpa',
    rubrique: 'creer-objet',
    question: 'Comment créer une hôtellerie de plein air ?',
    keywords: ['plein air', 'mobil-home', 'emplacement', 'glamping'],
    types: ['HPA'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un hébergement de plein air aménagé (mobil-homes, bungalows toilés, tentes équipées, glamping) — type **Hôtellerie de plein air (HPA)**.

**Quand choisir ce type.** Hébergements aménagés en extérieur, avec des emplacements équipés. **Pas ce type si** : emplacements nus pour tente/caravane apportée par le client → Camping (CAMP).

**Étapes.** Créer → type « Hôtellerie de plein air » → nom exact. Renseignez la **capacité et les emplacements** (section Chambres, capacité & séminaire).

**Pièges.** Ne confondez pas avec un Camping (CAMP) : la distinction porte sur l'aménagement de l'emplacement, pas sur la taille de l'établissement.`,
  },
  {
    id: 'creer-camp',
    rubrique: 'creer-objet',
    question: 'Comment créer un camping ?',
    keywords: ['camping', 'tente', 'caravane', 'emplacement'],
    types: ['CAMP'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un terrain avec des emplacements nus pour tentes, caravanes ou camping-cars — type **Camping (CAMP)**.

**Quand choisir ce type.** Le client apporte son propre matériel d'hébergement (tente, caravane). **Pas ce type si** : hébergements déjà aménagés sur place (mobil-homes, bungalows toilés) → Hôtellerie de plein air (HPA).

**Étapes.** Créer → type « Camping » → nom exact. Renseignez la **capacité et les emplacements** (section Chambres, capacité & séminaire).

**Pièges.** Un camping qui loue aussi des mobil-homes reste un Camping tant que l'offre principale est l'emplacement nu — sinon orientez vers HPA (voir la rubrique « Choisir le bon type »).`,
  },
  {
    id: 'creer-rva',
    rubrique: 'creer-objet',
    question: 'Comment créer une résidence de vacances ?',
    keywords: ['résidence', 'appartement', 'studio', 'vacances'],
    types: ['RVA'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un ensemble locatif (appartements, studios) avec des services collectifs (accueil, ménage, parfois piscine ou animation) — type **Résidence de vacances (RVA)**.

**Quand choisir ce type.** Plusieurs logements gérés par un même exploitant, avec des services partagés. **Pas ce type si** : un seul logement loué indépendamment, sans services collectifs → Gîte & meublé (HLO).

**Étapes.** Créer → type « Résidence de vacances » → nom exact. Renseignez la **capacité et les logements** (section Chambres, capacité & séminaire).

**Pièges.** La frontière avec le Gîte & meublé (HLO) tient aux services collectifs, pas au nombre de logements — un exploitant avec plusieurs gîtes indépendants reste en HLO (une fiche par logement).`,
  },
  {
    id: 'creer-res',
    rubrique: 'creer-objet',
    question: 'Comment créer un restaurant, un bar ou un snack ?',
    keywords: ['restaurant', 'snack', 'bar', 'table', 'carte', 'menu'],
    types: ['RES'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un établissement de la famille **Restauration · Bar · Snack** — type **Restaurant (RES)** : restaurant, bar, snack, food-truck.

**Quand choisir ce type.** Toute offre de restauration ou de boisson sur place ou à emporter.

**Étapes.** Créer → type « Restaurant » → nom exact. Dans l'éditeur, section **Cuisine, cartes & service** : déclarez les **cuisines proposées**, construisez le **menu structuré** (titre → sections → plats) et ajoutez éventuellement une **carte en PDF**. Renseignez ensuite les **horaires d'ouverture**.

**Pièges.** Le menu structuré et la carte PDF sont deux choses différentes et complémentaires : le menu structuré alimente la recherche et l'affichage, la carte PDF est un document consultable tel quel — inutile de choisir l'un contre l'autre.`,
  },
  {
    id: 'creer-iti',
    rubrique: 'creer-objet',
    question: 'Comment créer un itinéraire de randonnée ?',
    keywords: ['randonnée', 'rando', 'sentier', 'boucle', 'trail', 'vtt', 'itinéraire'],
    types: ['ITI'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un parcours de randonnée, trail ou VTT avec un tracé géographique — type **Itinéraire (ITI)**.

**Quand choisir ce type.** Un parcours praticable avec un point de départ et un tracé (boucle ou linéaire).

**Étapes.** Créer → type « Itinéraire » → nom exact. Dans l'éditeur, section **Tracé, étapes & praticabilité** : **importez le tracé** (fichier GPX ou KML) — la distance, le dénivelé et la durée se calculent automatiquement à l'import. Ajoutez ensuite les **étapes** (avec leurs photos) et les informations pratiques (balisage, équipement).

**Pièges.** Le tracé ne se dessine pas à la main dans l'éditeur : il doit être **importé** depuis un fichier GPX/KML. Sans tracé importé, la fiche ne peut pas être publiée.`,
  },
  {
    id: 'creer-fma',
    rubrique: 'creer-objet',
    question: 'Comment créer une fête ou une manifestation ?',
    keywords: ['fête', 'événement', 'manifestation', 'festival', 'concert'],
    types: ['FMA'],
    related: ['creer-fiche', 'choisir-fma-act'],
    answer: `**C'est quoi.** Un événement daté — fête, festival, concert, marché de Noël — type **Fête / manifestation (FMA)**.

**Quand choisir ce type.** L'offre a une ou plusieurs dates précises (une édition, une série d'occurrences). **Pas ce type si** : l'activité est proposée en continu toute l'année, sans dates d'édition → Activité (ASC) ou Activité encadrée (ACT).

**Étapes.** Créer → type « Fête / manifestation » → nom exact. Dans l'éditeur, section **Dates & programmation** : renseignez la **date de l'événement** ou ajoutez des **occurrences** (récurrence possible).

**Pièges.** Sans date de début ni occurrence renseignée, la publication est bloquée — une manifestation « permanente » sans dates n'est pas le bon modèle pour ce type.`,
  },
  {
    id: 'creer-asc',
    rubrique: 'creer-objet',
    question: 'Comment créer une activité sportive ou culturelle ?',
    keywords: ['activité', 'sport', 'culture', 'initiation'],
    types: ['ASC'],
    related: ['creer-fiche', 'choisir-asc-act'],
    answer: `**C'est quoi.** Une activité pratiquée en autonomie ou avec un encadrement léger (randonnée aquatique, initiation, sortie découverte) — type **Activité (ASC)**.

**Quand choisir ce type.** L'activité est disponible en continu (pas d'édition datée) et l'encadrement, s'il existe, reste léger. **Pas ce type si** : événement avec des dates précises → Fête / manifestation (FMA) ; prestation commerciale encadrée avec réservation (stage, sortie guidée) → Activité encadrée (ACT), voir la rubrique « Choisir le bon type ».

**Étapes.** Créer → type « Activité » → nom exact. Dans l'éditeur, section **Fiche activité & encadrement** : renseignez durée, participants, âge, niveau et équipements.

**Pièges.** La frontière ASC / ACT n'est pas toujours évidente — vérifiez l'arbitrage détaillé dans la rubrique « Choisir le bon type » avant de trancher.`,
  },
  {
    id: 'creer-act',
    rubrique: 'creer-objet',
    question: 'Comment créer une activité encadrée (atelier, sortie guidée) ?',
    keywords: ['atelier', 'stage', 'guide', 'sortie', 'encadrée', 'réservation'],
    types: ['ACT'],
    related: ['creer-fiche', 'choisir-artisan', 'choisir-org-actor'],
    answer: `**C'est quoi.** Une prestation commerciale encadrée (atelier, stage, sortie guidée, activité avec moniteur) — type **Activité encadrée (ACT)**.

**Quand choisir ce type.** Un opérateur encadre et commercialise la prestation. **Pas ce type si** : pratique en autonomie ou encadrement léger → Activité (ASC).

**Sous-catégorie.** Une fiche ACT respecte le schéma de rattachement standard : l'**organisation publicatrice** (ORG, ex. l'OTI) qui porte la fiche, l'**opérateur** (ACTOR — guide, moniteur, prestataire) qui l'encadre réellement, et un **lieu de rendez-vous** (localisation). Ne créez jamais une ORG pour chaque prestataire commercial : c'est un ACTOR.

**Étapes.** Créer → type « Activité encadrée » → nom exact. Dans l'éditeur, section **Fiche activité & encadrement** : durée, participants, encadrement. Renseignez ensuite le **lieu de rendez-vous** (Localisation) et rattachez l'opérateur depuis la section Liens vers fiches ou Rattachements.

**Pièges.** Ne confondez pas l'organisation publicatrice (ORG) et l'opérateur commercial (ACTOR) — le second n'est jamais une ORG. Voir la rubrique « Choisir le bon type » pour l'arbitrage ASC/ACT.`,
  },
  {
    id: 'creer-loi',
    rubrique: 'creer-objet',
    question: 'Comment créer un loisir (parc, plaine de jeux…) ?',
    keywords: ['loisir', 'parc', 'jeux', 'accrobranche'],
    types: ['LOI'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un équipement de loisir permanent et marchand — parc, plaine de jeux, accrobranche — type **Loisir (LOI)**.

**Quand choisir ce type.** Équipement fixe, accès généralement payant, ouvert en continu (hors événements ponctuels). **Pas ce type si** : accès libre et non marchand → Service public (SPU) ; patrimoine bâti ou culturel → Patrimoine (PCU) ; site naturel remarquable → Site naturel (PNA).

**Étapes.** Créer → type « Loisir » → nom exact. Renseignez la description, les photos, les tarifs et les horaires d'ouverture.

**Pièges.** La frontière LOI/PCU/PNA se joue sur la nature du site (aménagé et marchand vs. patrimonial vs. naturel) — vérifiez l'arbitrage dans la rubrique « Choisir le bon type ».`,
  },
  {
    id: 'creer-pcu',
    rubrique: 'creer-objet',
    question: 'Comment créer un site patrimonial ou culturel ?',
    keywords: ['patrimoine', 'musée', 'église', 'culture', 'monument'],
    types: ['PCU'],
    related: ['creer-fiche', 'choisir-pcu-loi'],
    answer: `**C'est quoi.** Un site patrimonial ou culturel bâti — musée, église, monument — type **Patrimoine (PCU)**.

**Quand choisir ce type.** Le site a une valeur patrimoniale ou culturelle reconnue. **Pas ce type si** : équipement de loisir marchand sans valeur patrimoniale → Loisir (LOI).

**Étapes.** Créer → type « Patrimoine » → nom exact. Dans l'éditeur, section **Visite & médiation** : renseignez les modes de visite et les équipements de médiation (livret, visite guidée).

**Pièges.** Le musée est rattaché exclusivement à PCU (jamais à LOI) — c'est la source de vérité unique pour ce type de site.`,
  },
  {
    id: 'creer-pna',
    rubrique: 'creer-objet',
    question: 'Comment créer un site naturel ?',
    keywords: ['nature', 'cascade', 'point de vue', 'forêt', 'site naturel'],
    types: ['PNA'],
    related: ['creer-fiche', 'choisir-pna-loi'],
    answer: `**C'est quoi.** Un site naturel remarquable — cascade, point de vue, forêt, belvédère — type **Site naturel (PNA)**.

**Quand choisir ce type.** Le site est un espace naturel, généralement en accès libre. **Pas ce type si** : équipement aménagé et marchand → Loisir (LOI).

**Étapes.** Créer → type « Site naturel » → nom exact. Renseignez la localisation précise, la description et les photos ; ajoutez les conditions d'accès si pertinent.

**Pièges.** Un site naturel aménagé avec billetterie (parc animalier, jardin payant) bascule souvent vers Loisir (LOI) — vérifiez l'arbitrage dans la rubrique « Choisir le bon type ».`,
  },
  {
    id: 'creer-prd',
    rubrique: 'creer-objet',
    question: 'Comment créer un producteur ?',
    keywords: ['producteur', 'ferme', 'vanille', 'distillerie', 'dégustation'],
    types: ['PRD'],
    related: ['creer-fiche', 'choisir-prd-com'],
    answer: `**C'est quoi.** Un producteur local visitable, avec vente directe ou dégustation (vanille, thé, miel, distillerie…) — type **Producteur (PRD)**.

**Quand choisir ce type.** Production locale doublée d'un accueil du public (visite, dégustation, vente directe sur site). **Pas ce type si** : repas servis sur place comme activité principale → Restaurant (RES) ; revente seule sans lien avec la production → Commerce (COM) ; visite guidée commercialisée par un tiers → Activité encadrée (ACT).

**Étapes.** Créer → type « Producteur » → nom exact. Renseignez la localisation, la description de la production, les photos et les modalités de visite ou de vente.

**Pièges.** L'arbitrage production+accueil (PRD) / repas (RES) / revente seule (COM) / visite guidée (ACT) n'est pas toujours intuitif — vérifiez la rubrique « Choisir le bon type » avant de trancher.`,
  },
  {
    id: 'creer-psv',
    rubrique: 'creer-objet',
    question: 'Comment créer un prestataire de services ?',
    keywords: ['prestataire', 'location', 'transport', 'service'],
    types: ['PSV'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un prestataire touristique hors activité encadrée — location de matériel, transport, agence — type **Prestataire (PSV)**.

**Quand choisir ce type.** L'offre est un service support au séjour, pas une activité pratiquée sur place avec encadrement. **Pas ce type si** : activité encadrée avec moniteur/guide → Activité encadrée (ACT).

**Étapes.** Créer → type « Prestataire » → nom exact. Dans l'éditeur, section **Prestations au comptoir** : renseignez les prestations proposées.

**Pièges.** Vérifiez le périmètre exact de ce type dans la rubrique « Choisir le bon type » avant de créer la fiche — la frontière avec Activité encadrée (ACT) et Commerce (COM) dépend du service précis proposé.`,
  },
  {
    id: 'creer-vil',
    rubrique: 'creer-objet',
    question: 'Comment créer une ville ou un village ?',
    keywords: ['ville', 'village', 'commune', 'bourg'],
    types: ['VIL'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Une fiche territoire présentant une ville, un village ou un bourg — type **Ville (VIL)**.

**Quand choisir ce type.** Usage éditorial : présenter un territoire (histoire, ambiance, points d'intérêt), pas un établissement.

**Étapes.** Créer → type « Ville » → nom exact. Renseignez la description, les photos et les points d'intérêt à mettre en avant.

**Pièges.** Une fiche Ville ne remplace pas les fiches des établissements ou sites qu'elle mentionne — elle les complète, elle ne s'y substitue pas.`,
  },
  {
    id: 'creer-com',
    rubrique: 'creer-objet',
    question: 'Comment créer un commerce ?',
    keywords: ['commerce', 'boutique', 'magasin', 'artisanat', 'souvenir'],
    types: ['COM'],
    related: ['creer-fiche', 'choisir-artisan'],
    answer: `**C'est quoi.** Un commerce utile au visiteur — boutique, magasin, atelier d'artisan — type **Commerce (COM)**.

**Quand choisir ce type.** Vente de produits ou de créations, y compris l'**artisanat**. **Pas ce type si** : production visitable avec accueil du public → Producteur (PRD).

**Sous-catégorie.** Précisez la nature du commerce via la taxonomie (boutique de souvenirs, épicerie fine, atelier d'artisan…) dans la section Identité & taxonomie.

**Étapes.** Créer → type « Commerce » → nom exact. Renseignez la localisation, les horaires d'ouverture et la sous-catégorie de taxonomie.

**Pièges.** Un artisan qui vend uniquement sa production sans accueil du public reste en Commerce (COM) — voir la rubrique « Choisir le bon type » pour l'arbitrage avec Producteur (PRD).`,
  },
  {
    id: 'creer-spu',
    rubrique: 'creer-objet',
    question: 'Comment créer un service public ?',
    keywords: ['service public', 'mairie', 'office', 'santé'],
    types: ['SPU'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un service ou équipement public utile au visiteur — mairie, office de tourisme, point santé, aire de pique-nique, toilettes publiques — type **Service public (SPU)**. Le périmètre de ce type est volontairement large : tout équipement public en accès libre et non marchand utile au tourisme.

**Quand choisir ce type.** Équipement ou service en accès libre, non marchand. **Pas ce type si** : équipement de loisir marchand → Loisir (LOI).

**Étapes.** Créer → type « Service public » → nom exact. Renseignez la localisation précise et les horaires si applicable.

**Pièges.** Un équipement payant (billetterie) n'est en principe pas un Service public — orientez-le vers Loisir (LOI) ; vérifiez au besoin la rubrique « Choisir le bon type ».`,
  },
];
