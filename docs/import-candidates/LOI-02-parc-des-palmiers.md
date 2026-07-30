# Parc des Palmiers — LOI (Loisir / Site de loisir & de découverte)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : LOI
- name : Parc des Palmiers
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré** (vérification SQL live du 2026-06-26 sur `public.object` — recherche `name ILIKE '%palmier%'`/`%palm%` : seules des fiches HLO/RES homonymes ressortent — "Le Palmier", "Les Palmiers", "Villa Palmeraie", "Auberge Le Palmier", etc. — aucune n'est le parc botanique municipal). À NE PAS confondre avec ces hébergements/restaurants. NB : ce site est cité comme atout botanique sur le site de l'OTI du Sud (sudreuniontourisme.fr) mais n'a pas (encore) de fiche objet dédiée en base.

## Identité
- Catégorie / sous-type proposé : Parc & jardin botanique — site de promenade et de découverte (conservatoire de palmiers). Géré par la commune du Tampon.
- Chapo : Le plus vaste parc dédié aux palmiers du monde dans l'océan Indien — un conservatoire botanique de 20 hectares aux portes du Tampon, gratuit et ouvert toute l'année, idéal pour une promenade en famille.

## Description
Le Parc des Palmiers (ou « Parc des Palmiers du monde ») est un parc botanique municipal aménagé sur d'anciennes terres de canne à sucre, sur les quartiers de Trois-Mares, du Dassy et de Bras de Pontho, au Tampon. Première zone (8 hectares) ouverte au public en janvier 2010, le parc a été étendu à partir de 2022 ; sa seconde zone a été inaugurée en avril 2024, portant la superficie totale à 20 hectares (env. 7 300 m de cheminements). Il rassemble près de 20 000 palmiers représentant environ 1 250 espèces différentes, ce qui en fait l'un des ensembles botaniques les plus importants de l'océan Indien consacrés à cette famille végétale, avec un objectif municipal de 40 000 sujets à terme. Le parc fonctionne aussi comme un véritable conservatoire botanique (préservation d'espèces menacées et en danger critique). Le projet est né d'un partenariat signé en 1998 avec l'association Palmeraie-Union et porté par la commune du Tampon. L'accès est gratuit et le site offre des allées sans difficulté, accessibles aux poussettes.

## Adresse & localisation (object_location)
- Adresse : 246 chemin Dassy (orthographe « chemin du Dassy » selon les sources ; n° 224 selon Mappy), quartier Trois-Mares
- Code postal / ville : 97430 Le Tampon (code postal 97430 ; commune INSEE 97422 — ne pas confondre)
- GPS (WGS84) : **-21.2526, 55.4946** — source : centroïde du polygone OpenStreetMap du parc (way #304974537, leisure=park, « Parc Des Palmiers, Bras de Pontho, Le Tampon »), corroboré par l'IRT/reunion-tourisme.com (-21.2546, 55.4946) et Wikipédia (21°15′10″S, 55°29′40″E ≈ -21.2528, 55.4944). NB : le géocodage BAN `api-adresse.data.gouv.fr` de « 246 chemin Dassy 97430 Le Tampon » (citycode 97422) ne renvoie qu'une approximation de voie (« Chemin du Dassy », lat -21.255774 / lon 55.489133, **score 0,55**, sans le numéro) ⇒ écarté au profit de la géométrie OSM, plus fiable pour un site étendu de 20 ha. Coordonnée de départ fournie (-21.2730, 55.5360) **non retenue** — éloignée du polygone du parc (à recaler sur le terrain).
- Altitude : env. 700 m (estimation d'après le secteur Trois-Mares/Dassy ; **à confirmer** — non explicitement publiée pour le parc)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (aucun numéro dédié publié ; parc municipal gratuit — contact via la mairie du Tampon / service espaces verts)
- Email : Non trouvé — à compléter
- Site web : https://letampon.fr/parc-des-palmiers-du-monde/ (page officielle de la commune du Tampon)
- Réseaux sociaux : Facebook « Parcs Des Palmiers » — https://www.facebook.com/ParcsDesPalmiers/ (à confirmer comme page officielle ; association Palmeraie-Union : palmeraie-union.com)

## Horaires (object_opening)
Ouvert 7 j/7 toute l'année, selon deux régimes saisonniers (sources OTI Sud + relais touristiques) :
- Saison « été austral » (1er décembre → 30 avril ; variante 1er novembre → 30 avril selon OTI Sud) : 6h00 – 19h00
- Saison « hiver austral » (1er mai → 30 novembre ; variante 1er mai → 31 octobre selon OTI Sud) : 6h30 – 18h30
NB : léger écart de bornes de saison entre sources (à fiabiliser auprès de la mairie avant publication).

## Tarifs (object_price)
**Gratuit** — accès libre, ouvert à tous (parc municipal). Source : letampon.fr, OTI du Sud, IRT.

## Données spécifiques LOI
LOI = pas de table-facette type-spécifique (`object_act`/`object_iti`/etc.). Les caractéristiques sont portées par classifications/labels génériques + description :
- Type de site : parc botanique / conservatoire de palmiers, propriété et gestion communales (Le Tampon)
- Superficie : 20 ha (8 ha en 2010 → extension inaugurée avril 2024)
- Cheminements : env. 7 300 m d'allées, sans difficulté, praticables en poussette
- Collection : ~20 000 palmiers, ~1 250 espèces (objectif annoncé 40 000 sujets / 1 000+ espèces)
- Fréquentation annoncée : ~250 000 visiteurs/an (source letampon.fr — à considérer comme communication municipale, non vérifiée)
- Aire de jeux pour enfants présente (mention Mappy « Parc et zone de jeu » ; à confirmer)

## Équipements & services (object_amenity)
- Parking : 220 places dont 10 PMR et 8 places bus (source letampon.fr)
- Sanitaires : Non trouvé — à compléter
- Restauration / point d'eau : Non trouvé — à compléter (pique-nique interdit sur le site)
- Aire de jeux enfants : oui (à confirmer)
- Allées promenade / parcours sportif : oui
- Règlement : animaux interdits (même tenus en laisse) ; véhicules à moteur, vélos, rollers, skates et trottinettes interdits ; pique-nique interdit

## Paiement / langues / accessibilité
- Moyens de paiement : sans objet (accès gratuit)
- Langues : contenu FR ; audioguides en anglais mentionnés (source IRT — à confirmer la disponibilité réelle sur site)
- Accessibilité PMR : allées sans difficulté, accessibles poussette ; 10 places de parking PMR. Niveau d'accessibilité label/certifié : Non trouvé — à compléter

## Labels & classements (object_classification)
Aucun label touristique formel trouvé (pas de mention « Jardin remarquable », Tourisme & Handicap, etc.). Le parc se revendique « conservatoire botanique » mais aucun classement/agrément officiel n'a été confirmé par les sources consultées. → Aucun LBL_* à mapper pour l'instant ; à vérifier auprès de la mairie.

## Médias suggérés
Photos officielles disponibles sur la page communale et les relais touristiques (NE PAS télécharger sans autorisation) :
- https://letampon.fr/parc-des-palmiers-du-monde/ (visuels officiels commune du Tampon)
- https://www.facebook.com/ParcsDesPalmiers/ (galerie réseau social)
- https://fr.wikipedia.org/wiki/Parc_des_Palmiers (illustrations sous licence — vérifier les conditions Commons)

## Données manquantes / à vérifier
- Numéro de téléphone / e-mail de contact officiel
- Coordonnées GPS exactes du point d'accueil/entrée principale (à recaler sur le terrain ; OSM = centroïde du parc)
- Numéro de voie exact (246 vs 224 chemin du Dassy) et adresse postale précise
- Bornes de saison définitives des horaires (écart 1er nov vs 1er déc / 31 oct vs 30 nov entre sources)
- Altitude précise
- Présence/état des sanitaires, points d'eau, aire de jeux
- Existence d'audioguides EN et d'éventuelles visites guidées
- Tout label/agrément officiel (Jardin remarquable, T&H…)
- Statut exact de la page Facebook (officielle commune vs association)

## Sources
- Parc des Palmiers du monde — https://letampon.fr/parc-des-palmiers-du-monde/ — consulté le 2026-06-26 (site officiel commune du Tampon : superficie, parking 220 places dont 10 PMR/8 bus, gratuit, 7j/7, ~250 000 visiteurs/an, association Palmeraie-Union)
- Forêts et sentiers botaniques — https://www.sudreuniontourisme.fr/tresors-du-sud/forets-et-sentiers-botaniques.html — consulté le 2026-06-26 (OTI du Sud : description « poumon vert », 20 ha, gratuit, horaires saisonniers 6h-19h / 6h30-18h30, accès RN3→D3 Trois-Mares→chemin Dassy)
- Parc des Palmiers — https://fr.wikipedia.org/wiki/Parc_des_Palmiers — consulté le 2026-06-26 (historique 1998/2010/2024, 20 ha, ~20 000 palmiers / ~1 250 espèces, ~7 300 m d'allées, coordonnées 21°15′10″S 55°29′40″E, coût extension 7 323 595 €)
- Parc des Palmiers — Tampon — https://guidepei.reunion-tourisme.com/secteur-sud/i/78784347/parc-des-palmiers — consulté le 2026-06-26 (IRT/reunion-tourisme : adresse Chem. du Dassy Trois-Mares, GPS -21.2546 / 55.4946, audioguides EN)
- OpenStreetMap — Nominatim « Parc des Palmiers Le Tampon » (way #304974537, leisure=park) — https://nominatim.openstreetmap.org/search?q=Parc+des+Palmiers+Le+Tampon&format=json — consulté le 2026-06-26 (géométrie du parc, centroïde -21.2526 / 55.4946)
- Géocodage BAN — https://api-adresse.data.gouv.fr/search/?q=246+chemin+Dassy+Trois-Mares+97430+Le+Tampon&citycode=97422 — consulté le 2026-06-26 (approximation de voie « Chemin du Dassy », -21.255774 / 55.489133, score 0,55 — écartée au profit d'OSM)
