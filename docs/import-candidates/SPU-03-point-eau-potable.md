# Point d'eau potable — Belvédère de Bois Court, Le Tampon — SPU (Service public)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : Point d'eau potable — Belvédère de Bois Court, Le Tampon
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Sous-catégorie (taxonomy_spu) : drinking_water
- Doublon potentiel en base : aucun repéré pour un objet « point d'eau » (re-vérifié le 2026-06-11 : `name ilike '%bois court%'` → 0 ligne dans `object`). ATTENTION : si un objet « Belvédère de Bois Court » (point de vue / PNA) existe ou est créé, le point d'eau doit rester un objet SPU distinct (équipement public autonome), éventuellement relié au site par `object_relation`.

## Identité
- Chapo : Robinets d'eau potable en libre accès à l'entrée du site du Belvédère de Bois Court (La Plaine des Cafres, Le Tampon), point de départ du sentier de Grand Bassin et site de pique-nique très fréquenté.

## Description
Point d'eau public situé sur le site du Belvédère de Bois Court, à environ 1 390 m d'altitude à La Plaine des Cafres (commune du Tampon). Le répertoire collaboratif eau-cyclisme.com le décrit comme des robinets situés « à gauche, juste après la barrière avant les kiosques » (fiche ajoutée en 2021), et OpenStreetMap recense un nœud `amenity=drinking_water` au même emplacement (à ~11 m, relevé de septembre 2021). Le belvédère, géré par la commune du Tampon, est un site touristique majeur du Sud : panorama sur le village de Grand Bassin et la cascade du Voile de la Mariée, aire de pique-nique engazonnée avec kiosques, départ de la randonnée vers Grand Bassin, marché de producteurs le dimanche matin. Le site a été réaménagé en 2025 (plateforme en verre et nouvelle horloge à eau inaugurées le 28 août 2025) ; la persistance et l'emplacement exact des robinets après ces travaux restent à vérifier sur le terrain. Le point d'eau dessert promeneurs, pique-niqueurs et randonneurs au départ de Grand Bassin.

## Adresse & localisation (object_location)
- Adresse : Terminus de la route de Bois Court (D70, ~5 km depuis la RN3 au Vingt-Troisième), Bois Court, La Plaine des Cafres — adresse BAN la plus proche : Impasse des Bois Cassants, 97418 Le Tampon (à 82 m du point GPS)
- Code postal / ville : 97418 Le Tampon (La Plaine des Cafres)
- GPS (WGS84) : -21.191208, 55.536898 — source : eau-cyclisme.com (fiche poi4256) ; corroboré par OpenStreetMap nœud 9091504472 (-21.1911055, 55.5368728, écart ~11 m) et par les coordonnées du belvédère sur Wikipédia (21°11′26″S, 55°32′13″E) ; commune confirmée par géocodage inverse BAN (Le Tampon, citycode INSEE 97422, voir Sources)

## Contacts (object_contact)
- Gestionnaire / exploitant : site géré par la Commune du Tampon (arrêtés municipaux n° 615/2025 et 616/2025) ; exploitant du réseau d'eau potable : Non trouvé — à compléter
- Téléphone : Non trouvé — à compléter (standard mairie du Tampon possible, non vérifié pour cet équipement)
- Site web / appli : https://letampon.fr/actualites/les-infos-pratiques-pour-acceder-a-la-plateforme-en-verre-du-belvedere-de-bois-court/ (infos pratiques du site, pas du point d'eau)

## Horaires (object_opening)
Point d'eau référencé sans fermeture hivernale par eau-cyclisme (relevé 2021, avant réaménagement). Depuis août 2025, la plateforme en verre du site est ouverte du mardi au dimanche (lundi : maintenance), 9h–18h en été austral (1er sept.–30 avril) et 9h–17h en hiver austral (1er mai–31 août). L'accessibilité des robinets en dehors de ces horaires (situés « après la barrière ») est à vérifier — Non trouvé — à compléter.

## Coût (object_price)
Gratuit — point d'eau public en libre accès (référencé comme tel par eau-cyclisme.com, répertoire de points d'eau gratuits ; aucune mention de tarif dans les sources consultées). Tarification éventuelle du site réaménagé : non précisée par la commune (la presse locale évoquait la gratuité à l'inauguration, débat « gratuité en question » signalé) — à confirmer.

## Données spécifiques SPU
- Sous-catégorie (taxonomy_spu) : drinking_water
- Accès : libre accès sur site extérieur ; « à gauche, juste après la barrière avant les kiosques » (eau-cyclisme, 2021). Horaires du site réaménagé : mardi–dimanche 9h–18h (été austral) / 9h–17h (hiver austral) ; accès hors horaires : Non trouvé — à compléter
- Coût : gratuit (voir Coût ci-dessus)
- Accessibilité PMR : Non trouvé — à compléter (aucun tag `wheelchair` sur le nœud OSM, aucune mention dans les sources)
- Gestionnaire / exploitant : Commune du Tampon (gestionnaire du site) ; exploitant AEP : Non trouvé — à compléter
- Caractéristiques techniques : robinets (pluriel selon eau-cyclisme) ; nombre exact, type (robinet simple / fontaine), débit : Non trouvé — à compléter. Potabilité : présumée (référencé « eau potable » par eau-cyclisme et OSM) mais aucun arrêté ou affichage officiel consulté — vérifier l'absence de panneau « eau non potable » sur place

## Accessibilité
Non trouvé — à compléter (le site dispose d'un parking au terminus de la route ; aucune information PMR spécifique au point d'eau dans les sources consultées).

## Données manquantes / à vérifier
- Vérification TERRAIN post-réaménagement 2025 : les deux sources attestant les robinets (eau-cyclisme, OSM) datent de 2021, AVANT les travaux de la plateforme en verre (inaugurée le 28/08/2025) — confirmer que les robinets existent toujours et leur emplacement actuel
- Potabilité officielle (affichage sur place, contrôle sanitaire ARS) : non documentée
- Nombre et type exacts de robinets ; débit
- Exploitant du réseau d'eau potable (commune / CASUD / délégataire) : non recherché de façon concluante
- Accessibilité PMR du cheminement jusqu'aux robinets
- Accès au point d'eau en dehors des horaires d'ouverture de la plateforme (position par rapport à la barrière après réaménagement)
- Tarification éventuelle d'accès au site depuis 2025 (gratuité « en question » dans la presse)
- Téléphone / contact de gestion

## Sources
- Robinets du Belvédère de Bois Court — eau-cyclisme.com — https://www.eau-cyclisme.com/la-reunion/robinets-du-belvedere-de-bois-court-poi4256.htm — consulté le 2026-06-11 (GPS -21.191208, 55.536898 ; « à gauche, juste après la barrière avant les kiosques » ; ajouté en 2021 ; pas de fermeture hivernale)
- Liste des points d'eau de La Réunion — eau-cyclisme.com — https://www.eau-cyclisme.com/eau-departement-la-reunion-dRE.htm — consulté le 2026-06-11
- Nœud OpenStreetMap 9091504472 (`amenity=drinking_water`, v1 du 2021-09-14) — https://www.openstreetmap.org/api/0.6/node/9091504472 — consulté le 2026-06-11 (-21.1911055, 55.5368728)
- Géocodage inverse BAN (api-adresse.data.gouv.fr) — https://api-adresse.data.gouv.fr/reverse/?lon=55.536898&lat=-21.191208 — consulté le 2026-06-11 (commune Le Tampon, citycode INSEE 97422, CP 97418, adresse la plus proche « 8b Impasse des Bois Cassants 97418 Le Tampon » à 82 m, score 0,9918 ; re-vérifié le 2026-06-11)
- Bois Court — Wikipédia — https://fr.wikipedia.org/wiki/Bois_Court — consulté le 2026-06-11 (coordonnées du belvédère 21°11′26″S 55°32′13″E ; plateforme en verre août 2025 ; horloge à eau)
- Les infos pratiques pour accéder à la plateforme en verre du Belvédère de Bois Court — letampon.fr (Commune du Tampon) — https://letampon.fr/actualites/les-infos-pratiques-pour-acceder-a-la-plateforme-en-verre-du-belvedere-de-bois-court/ — consulté le 2026-06-11 (horaires mardi–dimanche 9h–18h / 9h–17h ; arrêtés n° 615/2025 et 616/2025 ; inauguration 28/08/2025)
- Bois Court — Point de vue sur Grand Bassin — guide-reunion.fr — https://guide-reunion.fr/bois-court-point-de-vue-sur-grand-bassin/ — consulté le 2026-06-11 (altitude 1 390 m ; accès D70 ~5 km ; kiosques, aire de pique-nique, parking, producteurs le dimanche matin)
- Bois-Court et Grand Bassin — Offices de tourisme du Sud de La Réunion (OTI du Sud) — https://www.sudreuniontourisme.fr/tresors-du-sud/bois-court-et-grand-bassin.html — consulté le 2026-06-11 (site engazonné, kiosques ; eau potable également signalée à mi-chemin du sentier de Grand Bassin)
- Le Tampon : la plateforme en verre du Belvédère de Bois Court ouverte au public — imazpress.com — https://imazpress.com/le-tampon-actualites/le-tampon-la-plateforme-en-verre-du-belvedere-de-bois-court-ouverte-au-public — consulté le 2026-06-11 (gestion par la ville du Tampon ; horaires)
