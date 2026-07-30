# La Plaine des Grègues — VIL (Village créole)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : VIL
- name : La Plaine des Grègues
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **Aucun doublon du village repéré** (vérification SQL live du 2026-06-26 : aucun objet `VIL` portant ce nom ; recherches `%grègue%`, `%curcuma%`, `%safran%`, `%plaine%` négatives sur le village lui-même). **ATTENTION — objet apparenté déjà en base** : `Maison du Curcuma` (`LOIRUN00000000VE`, type LOI, status `published`), qui est l'attraction phare *située dans* le village au 14 Rue du Rond. Le village (VIL) et la Maison du Curcuma (LOI) sont deux objets distincts (la localité créole englobante vs un point d'intérêt précis). **Action recommandée : NE PAS fusionner ; à l'import, LIER la Maison du Curcuma au village via `object_relation` (rôle de type « located_at / based_at_site » à confirmer dans `ref_object_relation_type`).** Également présents en base, sans rapport de doublon (hébergements jouant sur le thème safran) : `Au cœur du Safran` (HLO), `La Villa Safrané` (HLO) — pas d'action.

## Identité
- Catégorie / sous-type proposé : Village créole des Hauts / bourg rural de montagne — « capitale du safran péi (curcuma) »
- Chapo : Niché dans les Hauts de Saint-Joseph au creux d'un bassin aux allures de mini-cirque, le village authentique de la Plaine des Grègues est le berceau du « safran péi » (curcuma) de La Réunion. Loin des circuits touristiques, il marie patrimoine agricole, maisons créoles, sentiers de randonnée et une fête emblématique en novembre.

## Description
La Plaine des Grègues est un village rural des Hauts de Saint-Joseph (sud de La Réunion), perché dans un bassin verdoyant bordé par la Ravine des Grègues et la Rivière des Remparts, ce qui lui donne l'aspect d'un petit cirque. Il compte environ 1 700 habitants (source mairie / guides). Le village est surnommé la « capitale du safran péi » : le curcuma y est cultivé de génération en génération et la plaine en est aujourd'hui présentée comme le terroir d'excellence sur l'île. Le nom « Grègues » vient du créole désignant un filtre à café : l'eau des bassins s'infiltre et disparaît avant de réapparaître plus bas, par perméabilité du sol. Son passé agricole est marqué par l'ère du « paille-chouchou » (champs de chouchou) au tournant du XXe siècle. L'attraction phare est la Maison du Curcuma (14 Rue du Rond), qui présente la filière du safran péi (transformation, dégustations, boutique de produits locaux). Chaque année en novembre, la Fête du Curcuma (aussi annoncée « Safran en Fête ») anime le village. Plusieurs sentiers de randonnée partent du cœur du village, près de l'église.

## Adresse & localisation (object_location)
- Adresse : Cœur de village — Rue du Rond, La Plaine des Grègues (Hauts de Saint-Joseph). Repère central : église de la Plaine des Grègues / Maison du Curcuma (14 Rue du Rond).
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : **-21.323155, 55.605375** — source : géocodage BAN api-adresse.data.gouv.fr de « Rue du Rond Saint-Joseph » (citycode 97412), label « Rue du Rond 97480 Saint-Joseph », **score 0,974**, type `street`. Point de centralité du bourg (axe de l'église et de la Maison du Curcuma). À affiner sur le terrain pour le point d'accueil exact.
- Altitude : ~650–822 m (fourchette du village ; source Randopitons donne 650–822 m sur la boucle locale). Les guides citent fréquemment « ~800 m » pour le haut du village ; un guide (rentiles) indique 650 m. **À confirmer pour le point de référence retenu.**

## Contacts (object_contact)
- Téléphone : Non trouvé pour le village (pas d'accueil dédié). Pour l'attraction Maison du Curcuma, +262 262 37 54 66 (source : sudreuniontourisme.fr) — **à rattacher à l'objet LOI Maison du Curcuma, pas au VIL**.
- Email : Non trouvé — à compléter.
- Site web : Pages de référence — sudreuniontourisme.fr (OTI du Sud) et saintjoseph.re (mairie). Pas de site propre au village.
- Réseaux sociaux : Non trouvé — à compléter.

## Horaires (object_opening)
Non trouvé / sans objet — un village n'a pas d'horaires d'ouverture. Accès libre permanent à la localité et aux sentiers. (La Maison du Curcuma, objet distinct, a ses propres horaires, non confirmés ici — à compléter sur sa fiche.)

## Tarifs (object_price)
Accès au village et aux sentiers de randonnée : **gratuit** (site / localité en accès libre). La visite de la Maison du Curcuma (objet distinct) peut être payante — tarif non confirmé, à porter sur la fiche LOI dédiée.

## Données spécifiques VIL
Pas de table de facette dédiée pour le type VIL (classifications / labels génériques uniquement). Éléments descriptifs du village (à modéliser via description / relations / objets liés) :
- Population : ~1 700 habitants (mairie / guides).
- Identité thématique : « capitale du safran péi » (curcuma) — seul terroir de l'île encore en production selon la mairie.
- Points d'intérêt dans le village (objets à lier ultérieurement) :
  - Maison du Curcuma (déjà en base, `LOIRUN00000000VE`) — 14 Rue du Rond.
  - Église de la Plaine des Grègues — point de départ des sentiers, lieu de vie du bourg.
  - Aire / forêt du Rond — aire de pique-nique (cryptomerias).
  - Point de vue sur la Cascade Mottet (depuis la boucle locale).
- Sentiers de randonnée au départ du village (candidats à des objets ITI distincts) :
  - **Sentier du Curcuma et aire du Rond** (« Boucle du Curcuma ») : boucle 5,3 km, ~1h45, dénivelé +260 m, difficulté moyenne/famille, altitude 650–822 m, départ parking face à l'église (source Randopitons #1401).
  - **Boucle des Margosiers** : boucle 11 km, ~5h, dénivelé ~+900 à +950 m (Randopitons : +900 m ; OTI du Sud : 950 m), difficile, départ église, via Rue du Rond → Cascade Mottet → Piton de la Ligne des Mille (1 378 m) → Rivière des Remparts → retour village (source Randopitons #1101 + sudreuniontourisme.fr).
  - Autres mentionnées par les guides : Boucle du Piton de la Ligne des Mille (~10 km, ~3h30, modéré) — à vérifier.
- Événement récurrent (candidat à un objet FMA distinct) : **Fête du Curcuma / Safran en Fête**, annuelle, en **novembre** (marché artisanal, dégustations, animations, concerts).

## Équipements & services (object_amenity)
- Parking : oui — parking face à l'église / au cœur du village (départ des randonnées).
- Aire de pique-nique : oui — aire du Rond (forêt de cryptomerias).
- Restauration / commerces : présence de tables/produits du terroir et boutique (Maison du Curcuma) ; offre détaillée Non trouvée — à compléter.
- Sanitaires publics : Non trouvé — à compléter.
- Accès routier : route depuis le centre de Saint-Joseph (~30 min depuis Saint-Pierre selon les guides) ; voiture recommandée.

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet pour le village (accès libre). Pour les prestataires sur place (Maison du Curcuma), Non trouvé — à compléter.
- Langues : français / créole réunionnais (usage local). Autres langues d'accueil Non trouvées — à compléter.
- Accessibilité PMR : Non trouvé — à compléter (terrain de montagne, sentiers à dénivelé ; accessibilité du bourg à vérifier).

## Labels & classements (object_classification)
Aucun label officiel revendiqué trouvé pour le village en tant que tel (la Plaine des Grègues n'est pas, à la date de recherche, un « Village créole » sous label formel identifié dans les sources). Aucun mapping LBL_* proposé. À vérifier auprès de la mairie / OTI si une démarche de labellisation existe.

## Médias suggérés
- Photos officielles présentes sur les pages de l'OTI du Sud (sudreuniontourisme.fr) et de la mairie (saintjoseph.re), ainsi que sur les guides cités. **NE PAS télécharger sans autorisation** — vérifier les droits avant tout usage. Aucune URL d'image libre de droits confirmée ici.

## Données manquantes / à vérifier
- Point d'accueil / référence exact du village et son altitude définitive (650 vs 800 m selon sources).
- Coordonnées GPS à affiner sur le terrain (le point fourni est le centre-bourg via géocodage de la rue).
- Email, site web et réseaux sociaux éventuels (mairie quartier / association de quartier).
- Sanitaires publics, offre de restauration détaillée, accessibilité PMR.
- Statut/label officiel éventuel du village (« village créole » formel ?).
- Confirmation du nom exact de la fête (« Fête du Curcuma » vs « Safran en Fête ») et de l'édition courante.
- Décision d'import : créer les objets liés (Église, sentiers ITI, fête FMA) et rattacher la Maison du Curcuma existante.

## Sources
- La Plaine des Grègues — Offices de tourisme du Sud (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/la-plaine-des-gregues.html — consulté le 2026-06-26
- La Plaine des Grègues — Ville de Saint-Joseph (mairie) — https://saintjoseph.re/La-Plaine-des-Gregues — consulté le 2026-06-26
- La Plaine des Grègues : capitale du curcuma, randonnées et authenticité — guide-reunion.fr — https://guide-reunion.fr/la-plaine-des-gregues/ — consulté le 2026-06-26
- Découvrez la Plaine des Grègues — rentiles.fr — https://www.rentiles.fr/blog-voyage/la-plaine-des-gregues.html — consulté le 2026-06-26
- La plaine des Grègues, capitale du Curcuma — orkymel.fr — https://orkymel.fr/saint-joseph/la-plaine-des-gregues/ — consulté le 2026-06-26
- Le sentier du Curcuma et l'aire du Rond — Randopitons #1401 — https://randopitons.re/randonnee/1401-sentier-curcuma-aire-rond-plaine-gregues — consulté le 2026-06-26
- La Boucle des Margosiers à la Plaine des Grègues — Randopitons #1101 — https://randopitons.re/randonnee/1101-boucle-margosiers-plaine-gregues — consulté le 2026-06-26
- Géocodage BAN (centre-bourg, Rue du Rond) — https://api-adresse.data.gouv.fr/search/?q=Rue+du+Rond+Saint-Joseph&citycode=97412 — consulté le 2026-06-26
