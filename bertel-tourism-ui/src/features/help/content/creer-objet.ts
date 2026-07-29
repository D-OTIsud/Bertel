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
    related: ['creer-hebergement', 'choisir-artisan', 'publier-fiche'],
    answer: `**Où.** Bouton **Créer** de l'Explorer, ou palette de commandes (Ctrl/⌘ + K → « Créer une fiche »). Si le bouton n'apparaît pas, votre compte n'a pas le droit de création — voyez l'administrateur de votre organisation.

**Comment.** 1. Saisissez le **nom exact** de l'établissement ou de l'offre ; Bertel vous signale au passage les fiches au nom proche, pour éviter un doublon. 2. Choisissez ce que vous décrivez. Pour un **hébergement**, vous choisissez directement une **famille** puis une **nature** — voyez « Créer une fiche d'hébergement en 4 étapes ». Pour tout le reste (restaurant, activité, itinéraire, visite, service, événement), vous choisissez directement le type. 3. La fiche s'ouvre en **brouillon** dans l'éditeur.

**Ensuite.** Remplissez les sections prioritaires (identité, localisation, contacts, description, photos) puis publiez depuis la section Publication. Un brouillon n'est visible que par votre organisation.`,
  },
  {
    id: 'creer-hebergement',
    rubrique: 'creer-objet',
    question: "Créer une fiche d'hébergement en 4 étapes",
    keywords: [
      'hébergement', 'famille', 'nature', 'auberge', 'auberge collective', 'gîte de groupe',
      'refuge', 'gîte d’étape', 'résidence de tourisme', 'résidence hôtelière', 'résidence de vacances',
      'village de vacances', 'camping', 'camping aménagé', 'camping classé', 'aire naturelle',
      'terrain de camping déclaré', 'camping à la ferme', 'camping chez l’habitant',
      'parc résidentiel de loisirs', 'PRL', 'aire de bivouac', 'bivouac', 'aire d’accueil camping-car',
      'halte nocturne', 'halte van', 'plein air',
    ],
    types: ['HOT', 'HLO', 'RVA', 'CAMP', 'HPA'],
    related: ['creer-fiche', 'choisir-hlo-rva', 'editeur-nature-unite-service-tarif'],
    answer: `**1 · Nommez la fiche.** Saisissez le nom officiel de l'établissement. Bertel affiche les fiches au nom proche : ouvrez-en une si c'est la même offre, sinon continuez — un même nom ailleurs est légitime.

**2 · Choisissez directement la famille.** Les cinq boutons proposés dans la section Hébergement sont : **Hôtellerie**, **Hébergement locatif**, **Hébergement collectif**, **Campings et terrains**, **Aires et haltes de plein air**. Il n'y a pas de bouton « Hébergement » intermédiaire.

**3 · Choisissez la nature.** La nature répond à « **quel type d'établissement est-ce ?** » — pas à son bâtiment ni à ses équipements. Certaines natures se précisent ensuite : sous *Terrain de camping déclaré*, indiquez *à la ferme* ou *chez l'habitant*.

**4 · Complétez après la création.** Bertel déduit silencieusement le classement technique nécessaire. Dans l'éditeur, renseignez ensuite dans des champs séparés : les **types d'unité** (dans quoi le visiteur dort : bulle, tipi, lodge, cabane — plusieurs valeurs possibles), les **services** (eau, vidange, électricité…), le **classement** en étoiles, et les **tarifs**.

**Exemple.** Un établissement peut avoir pour nature *Aire naturelle de camping*, proposer des unités *Lodge* et *Cabane*, fournir eau et électricité, et être gratuit ou payant. **Aucune** de ces trois dernières informations ne change sa nature.

**Piège.** Le classement en étoiles est une information séparée de la nature *Camping* : un terrain non classé reste un camping.`,
  },
  {
    id: 'creer-hlo',
    rubrique: 'creer-objet',
    question: 'Comment créer un gîte, un meublé ou une chambre d’hôtes ?',
    keywords: ['gîte', 'meublé', 'chambre d’hôtes', 'maison d’hôtes', 'location saisonnière', 'kaz', 'villa', 'bungalow', 'location vacances', 'gîte de groupe', 'refuge'],
    types: ['HLO'],
    related: ['creer-fiche', 'choisir-hlo-rva'],
    answer: `**C'est quoi.** Un hébergement locatif non hôtelier : logement entier autonome (gîte, meublé, villa, bungalow), chambre d'hôtes chez l'habitant, ou hébergement collectif de type gîte/refuge.

**Comment choisir.** Pour un logement autonome ou une chambre chez l'habitant, choisissez *Hébergement locatif*, puis *Meublé de tourisme* ou *Chambre d'hôtes*. Pour l'accueil d'un groupe, choisissez *Hébergement collectif*, puis *Gîte* ou *Refuge et gîte d'étape*. **Pas ces natures si** : chambres exploitées comme un hôtel avec réception et services hôteliers → *Hôtellerie › Hôtel* ; ensemble d'appartements avec services collectifs → *Hébergement collectif › Résidence de tourisme* ; emplacement ou halte de plein air → l'une des deux familles dédiées.

**Étapes.** Créer → nom exact → famille → nature. Bertel calcule le type technique en arrière-plan. Dans l'éditeur, renseignez en priorité : localisation, contacts, description, photos, **capacité** et tarifs.

**Pièges.** Une maison d'hôtes reste une chambre d'hôtes : « maison » décrit la forme et ne doit pas la faire basculer dans les meublés. Le classement en étoiles d'un meublé de tourisme se saisit dans Classement & labels — jamais dans le nom.`,
  },
  {
    id: 'creer-hot',
    rubrique: 'creer-objet',
    question: 'Comment créer un hôtel ?',
    keywords: ['hôtel', 'chambre', 'nuitée', 'étoiles'],
    types: ['HOT'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un établissement proposant des chambres à la nuitée avec des services hôteliers (réception, ménage…).

**Quand choisir cette nature.** Réception et services hôteliers, chambres louées à la nuitée. **Pas cette nature si** : logement entier autonome ou chambre chez l'habitant avec petit-déjeuner → *Hébergement locatif* ; ensemble d'appartements avec services collectifs → *Hébergement collectif › Résidence de tourisme*.

**Étapes.** Créer → nom exact → *Hôtellerie* → *Hôtel*. Dans l'éditeur, renseignez la **capacité et les chambres** (section Chambres, capacité & séminaire) et le **classement en étoiles** (section Classifications & distinctions).

**Pièges.** Le nombre d'étoiles n'est pas un champ libre : il se déclare comme une classification officielle, avec son statut (accordée, en cours…), pas dans le nom ni la description.`,
  },
  {
    id: 'creer-hpa',
    rubrique: 'creer-objet',
    question: 'Comment créer une aire ou un hébergement de plein air ?',
    keywords: ['plein air', 'aire naturelle', 'terrain de camping déclaré', 'camping à la ferme', 'camping chez l’habitant', 'parc résidentiel de loisirs', 'PRL', 'camping-car', 'aire de bivouac', 'bivouac', 'halte nocturne', 'halte van', 'glamping', 'insolite'],
    types: ['HPA'],
    related: ['creer-hebergement', 'choisir-famille-hebergement'],
    answer: `**C'est quoi.** Deux familles distinctes, et la différence compte :

- **Campings et terrains** — *Aire naturelle de camping*, *Terrain de camping déclaré* (à préciser ensuite : *à la ferme* ou *chez l'habitant*), *Parc résidentiel de loisirs*. Ce sont des **terrains** organisés pour le séjour.
- **Aires et haltes de plein air** — *Aire de bivouac*, *Aire d'accueil camping-car*, *Halte nocturne camping-car/van*. Ce sont des **autorisations de halte**, pas des terrains de camping.

**Comment choisir.** Créer → nom exact → famille → nature. Bertel calcule le type technique ; vous n'avez pas à le connaître. Renseignez ensuite la **capacité et les emplacements** (section Chambres, capacité & séminaire).

**Pièges.**
- *Aire naturelle de camping* est un **camping** malgré le mot « aire » : elle est dans *Campings et terrains*.
- *Glamping*, *tipi*, *lodge* et *cabane* ne sont plus des natures : ce sont des **types d'unité**, à saisir après la création, et une fiche peut en porter plusieurs.
- La présence d'un mobil-home ne détermine rien : un camping classé peut proposer des locatifs. La frontière est le régime du terrain, pas l'équipement apporté par le client.`,
  },
  {
    id: 'creer-camp',
    rubrique: 'creer-objet',
    question: 'Comment créer un camping classé ?',
    keywords: ['camping', 'camping aménagé', 'camping classé', 'étoiles', 'tente', 'caravane', 'mobil-home', 'emplacement'],
    types: ['CAMP'],
    related: ['creer-hebergement', 'choisir-famille-hebergement'],
    answer: `**C'est quoi.** Un terrain aménagé pour l'accueil de tentes, caravanes ou résidences mobiles de loisirs — nature **Camping**, dans la famille *Campings et terrains*. Il peut proposer des emplacements nus, des mobil-homes ou les deux.

**Comment choisir.** Créer → nom exact → famille *Campings et terrains* → nature *Camping*. **Pas cette nature si** : le terrain relève du régime déclaratif (petite structure à la ferme ou chez un particulier) → *Terrain de camping déclaré* ; aménagement allégé → *Aire naturelle de camping* ; simple autorisation de halte → famille *Aires et haltes de plein air*.

**Étapes.** Renseignez ensuite le **classement** dans Classement & labels, puis la **capacité et les emplacements** (section Chambres, capacité & séminaire).

**Pièges.**
- Le **classement en étoiles est séparé de la nature** : un terrain non classé reste un *Camping*. Ne cherchez pas une nature « camping non classé ».
- Ne classez pas selon la proportion d'emplacements nus et de locatifs : un camping reste un camping même si les mobil-homes sont majoritaires.`,
  },
  {
    id: 'creer-rva',
    rubrique: 'creer-objet',
    question: 'Comment créer une résidence de tourisme ?',
    keywords: ['résidence', 'résidence de tourisme', 'résidence de vacances', 'appartement', 'studio', 'vacances'],
    types: ['RVA'],
    related: ['creer-fiche'],
    answer: `**C'est quoi.** Un ensemble locatif (appartements, studios) avec des services collectifs (accueil, ménage, parfois piscine ou animation) — nature **Résidence de tourisme**.

**Quand choisir cette nature.** Plusieurs logements gérés par un même exploitant, avec des services partagés. **Pas cette nature si** : logement autonome ou chambre d'hôtes → *Hébergement locatif* ; gîte collectif sans services de résidence → *Hébergement collectif › Gîte*.

**Étapes.** Créer → nom exact → *Hébergement collectif* → *Résidence de tourisme*. Renseignez la **capacité et les logements** (section Chambres, capacité & séminaire).

**Pièges.** La frontière avec HLO tient au fonctionnement en résidence et aux services collectifs, pas au seul nombre de logements — un exploitant avec plusieurs gîtes indépendants reste en HLO (une fiche par logement).`,
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
