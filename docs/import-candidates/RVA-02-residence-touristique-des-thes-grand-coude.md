# Résidence Touristique des Thés — RVA (Résidence de vacances)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : RVA
- name : Résidence Touristique des Thés
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **OUI — CONFIRMÉ en base live le 2026-06-11 : « Résidence Touristique des Thés », object_type HLO, status `published`** (requête `object` par nom ; l'id `HLORUN0000000105` cité précédemment n'a pas été re-vérifié dans cette passe). Ne PAS créer un second objet : arbitrer entre (a) requalification HLO → RVA de l'objet existant si la nature « ensemble de 4 villas exploitées en résidence » ET les services para-hôteliers sont confirmés, ou (b) maintien en HLO si les services para-hôteliers font défaut (état actuel des sources : aucun service para-hôtelier documenté ⇒ (b) par défaut).

## Identité
- Catégorie / sous-type proposé : Résidence touristique de villas meublées (ensemble homogène de 4 villas au village créole de Grand Coude)
- Chapo : Ensemble de quatre villas meublées de 5 personnes au cœur du village créole de Grand Coude, sur les hauts de Saint-Joseph, à proximité de la plantation de thé.

## Description
La Résidence Touristique des Thés est implantée dans le village créole de Grand Coude, plateau perché à environ 1 100 m d'altitude sur les hauts de Saint-Joseph, entre les vallées encaissées de la Rivière des Remparts et de la Rivière Langevin. Le village, relié au reste de la commune par l'étroit passage du Petit Serré, est connu pour sa plantation de thé (Labyrinthe En Champ Thé) qui donne son nom à la résidence.

L'ensemble comprend quatre villas identiques proposées à la location, chacune pouvant accueillir jusqu'à 5 personnes : deux chambres doubles, un canapé convertible, un salon, deux sanitaires, une cuisine aménagée et une terrasse. Le tarif relevé est de 380 € la semaine par villa.

Depuis la résidence, les visiteurs accèdent aux balades du plateau (point de vue sur la Rivière des Remparts, Trou de Cissia), à la découverte de la culture du thé et aux sentiers des Hauts du Sud sauvage.

À noter pour l'arbitrage de type : l'IRT (reunion.fr) et l'OTI du Sud (sudreuniontourisme.fr) référencent l'établissement en « location saisonnière / gîtes et villas » malgré son nom de « résidence touristique » ; les services para-hôteliers (accueil, ménage, linge) ne sont pas documentés dans les sources consultées. C'est néanmoins l'ensemble d'hébergements le plus proche du concept de résidence de vacances identifié sur la commune de Saint-Joseph.

## Adresse & localisation (object_location)
- Adresse : 26 bis, rue Théophile Gauthier (graphie BAN : « Chemin Theophile Gautier »), Grand Coude
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.293355, 55.62463 — source : géocodage BAN (api-adresse.data.gouv.fr) sur « 26 Chemin Theophile Gautier 97480 Saint-Joseph » — re-vérifié le 2026-06-11 : score 0,97, type `housenumber`, INSEE 97412 (le score 0,57 annoncé initialement correspondait à une requête sur la graphie « rue Théophile Gauthier Grand Coude », non BAN). Restriction maintenue : le « bis » du « 26 bis » n'est pas résolu par la BAN — position de parcelle à confirmer
- Altitude : ~1 100 m (plateau de Grand Coude — source : présentation du village, france-voyage.com / sudreuniontourisme.fr)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (fiches IRT : https://en.reunion.fr/offers/residence-touristiques-des-thes-saint-joseph-en-557999/ et OTI Sud : https://www.sudreuniontourisme.fr/fiche-etablissement/saint-joseph/location-saisonniere/residence-touristiques-des-thes-eta_2844.html)
- Réseaux sociaux : Non trouvé

## Horaires (object_opening)
Non trouvé — à compléter (location à la semaine ; pas d'horaires d'accueil documentés).

## Tarifs (object_price)
- 380 € la semaine par villa (source : données IRT reprises par EasyRode/cartedelareunion — année de validité non précisée, à confirmer)

## Données spécifiques RVA
- Nombre de logements : 4 villas
- Types de logements : villas type T3 (2 chambres doubles + canapé convertible au salon), capacité 5 personnes chacune, cuisine aménagée, 2 sanitaires, terrasse
- Services para-hôteliers : Non trouvé — à compléter (accueil, ménage, linge, petit-déjeuner non documentés ; point déterminant pour confirmer le type RVA vs HLO)
- Classement résidence de tourisme (Atout France) : Aucun trouvé

## Équipements & services (object_amenity)
Cuisine aménagée, terrasse (par villa). Autres équipements : Non trouvé.

## Paiement / langues / accessibilité
Non trouvé — à compléter.

## Labels & classements (object_classification)
Aucun trouvé.

## Médias suggérés
Aucun (photos des fiches IRT/EasyRode non vérifiées en droits — ne pas réutiliser sans accord).

## Données manquantes / à vérifier
- **Arbitrage de type : l'objet existe déjà en base en HLO (`HLORUN0000000105`) — requalifier en RVA uniquement si les services para-hôteliers sont confirmés ; sinon conserver HLO et ne pas créer de doublon**
- Gestionnaire / exploitant (structure privée, communale ou associative du village créole de Grand Coude ?) et coordonnées (téléphone, email)
- Services para-hôteliers effectifs (accueil sur place, ménage, fourniture du linge)
- Tarification en vigueur (le 380 €/semaine n'est pas millésimé) et conditions de location (nuitée possible ?)
- Position GPS exacte de la parcelle (le géocodage BAN ne résout que le « 26 » sans le « bis », score moyen)
- Classement éventuel des villas (meublés classés ? résidence de tourisme ?)

## Sources
- Résidence Touristiques des Thés (Saint-Joseph) — Île de la Réunion Tourisme — https://en.reunion.fr/offers/residence-touristiques-des-thes-saint-joseph-en-557999/ — consulté le 2026-06-11
- Résidence Touristiques des Thés — EasyRode (annuaire, données IRT : 4 villas, 5 pers., descriptif, 380 €/semaine, adresse) — https://www.easyrode.com/reunion-annuaire/974/professionnel-Saint-Joseph/Location-Gites-et-villas/ResidenceTouristiquesdesThes — consulté le 2026-06-11
- Location saisonnière Résidence Touristiques des Thés — Offices de tourisme du Sud — https://www.sudreuniontourisme.fr/fiche-etablissement/saint-joseph/location-saisonniere/residence-touristiques-des-thes-eta_2844.html — consulté le 2026-06-11 (fiche référencée ; contenu chargé côté client, détails non extraits)
- Grand Coude — présentation du village (plateau à ~1 100 m) — https://www.france-voyage.com/tourism/saint-joseph-2535.htm — consulté le 2026-06-11 (via résultats de recherche)
- Géocodage BAN — https://api-adresse.data.gouv.fr/search/?q=26+rue+Theophile+Gauthier+Grand+Coude+97480+Saint-Joseph — consulté le 2026-06-11
- Base interne Bertel (vérification doublon) — table `object`, id `HLORUN0000000105` — consultée le 2026-06-11
