# Le sentier botanique de Notre-Dame de la Paix — ITI (Itinéraire de randonnée)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ITI
- name : Le sentier botanique de Notre-Dame de la Paix
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `object` : seuls « Ecurie Notre Dame de la Paix » — ACT/prestataire équestre, published —, « Chalet de Notre Dame » — HLO/hébergement — et « Le Palmier de la Paix » — HLO — ressortent sur les motifs `notre/dame/paix/botanique/sentier` ; aucun n'est cet itinéraire de randonnée). NON présent dans la liste des 31 fiches déjà proposées (les items voisins « Point de vue du Nez de Bœuf » et « Point eau potable Belvédère de Bois Court » sont des objets distincts). Action recommandée : créer comme nouvel objet ITI.

## Identité
- Catégorie / sous-type proposé : Sentier de découverte / sentier botanique en boucle — randonnée pédestre très facile, forêt départementale d'altitude, balade familiale et pédagogique.
- Chapo : Une courte boucle botanique très facile (≈1,3 à 1,8 km selon les sources, ≈1 h) dans la forêt primaire d'altitude de Notre-Dame de la Paix, ponctuée de panneaux d'interprétation et d'un belvédère vertigineux sur la Rivière des Remparts.

## Description
Le sentier botanique de Notre-Dame de la Paix est une boucle de découverte aménagée dans la forêt départementale du même nom, sur les hauts du Tampon (Plaine des Cafres), vers 1 700 m d'altitude. Le parcours traverse des vestiges de forêt primaire d'altitude — arbres aux troncs tordus, fanjans (fougères arborescentes), barbes de Jupiter, mousses et épiphytes — dont certaines essences sont identifiées par des plaquettes d'interprétation le long du chemin. Avant ou en début de boucle, un belvédère aménagé offre une vue plongeante sur la Rivière des Remparts, l'îlet isolé de Roche-Plate et les paysages verdoyants de Grand Coude. Le sentier est annoncé « très facile » et accessible à tous publics, mais le sol peut être boueux par temps de pluie (chaussures adaptées recommandées). Le site dispose d'une aire de pique-nique et d'un parking dédié ; il s'inscrit dans le périmètre du Parc national de La Réunion. Sources : Randopitons, ile-delareunion.com, sudreuniontourisme.fr.

## Adresse & localisation (object_location)
- Adresse : Parking du sentier botanique, Forêt départementale de Notre-Dame de la Paix, RD36 (route de Notre-Dame de la Paix), Plaine des Cafres
- Code postal / ville : 97418 La Plaine des Cafres — Le Tampon (commune INSEE 97422)
- GPS (WGS84) : -21.26722, 55.60125 (lat, lon) — source : coordonnées du point de départ publiées par Randopitons (page tourisme 243) ; valeur cohérente avec ile-delareunion.com (même secteur, ~1 700 m). Géocodage BAN api-adresse.data.gouv.fr de l'adresse imprécis pour un site forestier : meilleur résultat « Chemin Notre Dame de la Paix 97418 Le Tampon », citycode 97422, score 0,44 (lon 55.577961 / lat -21.23448) — confirme la commune Le Tampon (97422) mais pas le point exact ; le reverse-géocodage du point trail renvoie un FeatureCollection vide (zone forestière non adressée, attendu). GPS du belvédère/parking à confirmer sur le terrain ou via la trace GPX Parc national / Wikiloc.
- Altitude : ~1 700 m (altitude haute 1716 m / basse 1684 m d'après Randopitons ; 1685 m d'après ile-delareunion.com)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (site naturel non géré par un opérateur commercial ; gestion ONF / Parc national / Département)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site dédié ; référencé par sudreuniontourisme.fr, reunion-parcnational.fr, randopitons.re)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Accès libre toute l'année (sentier forestier non gardienné). Praticabilité dégradée par temps de pluie (sol boueux). Conditions d'altitude (brouillard, fraîcheur) fréquentes l'après-midi. Horaires d'ouverture formels : Non trouvé — à compléter (site en accès libre, sans horaire).

## Tarifs (object_price)
Gratuit — site naturel en accès libre (forêt départementale / Parc national de La Réunion). Aucun droit d'entrée mentionné par les sources.

## Données spécifiques ITI (object_iti)
- Distance : valeurs divergentes selon les sources — 1,3 km (fiche Randopitons 1016, valeur la plus citée) / ≈1,7 km / 1,8 km (ile-delareunion.com, randopitons page tourisme) — boucle ; à arbitrer sur la trace GPX officielle
- Dénivelé positif : ≈30 m (fiche Randopitons 1016) / ≈50 m / 61 m (ile-delareunion.com) — à arbitrer
- Dénivelé négatif : Non trouvé — à compléter (boucle ⇒ ≈ équivalent au dénivelé positif)
- Durée : ≈1 h (sudreuniontourisme.fr indique « 45 min à 1 h »)
- Difficulté : Très facile / facile — accessible à tous publics
- Type : Boucle
- Balisage : « Pas de balises » selon Randopitons ; itinéraire bien tracé avec panneaux/plaquettes botaniques d'interprétation (signalétique ONF au départ). À confirmer sur le terrain.
- Altitude min/max : 1684 m / 1716 m (Randopitons)
- Point de départ : parking du sentier botanique ; le sentier démarre ≈150 m plus loin, en face du parking (Randopitons)
- Tracé GPX/KML : Non fourni ici — disponible via Randopitons (trace) et/ou la fiche Parc national (randotectec.reunion-parcnational.fr/treks/6311) ; PDF officiel non récupéré (erreur certificat lors du fetch) — à récupérer pour `object_iti.geom`

## Équipements & services (object_amenity)
- Parking : Oui — parking dédié au départ du sentier (gratuit)
- Aire de pique-nique : Oui — tables de pique-nique (Randopitons, ile-delareunion.com)
- Belvédère aménagé : Oui — point de vue avec garde-corps sur la Rivière des Remparts / Roche-Plate / Grand Coude
- Panneaux d'interprétation : Oui — plaquettes botaniques (essences, biotope) ; signalétique parfois dégradée (vandalisme signalé)
- Sanitaires / restauration / eau potable : Non trouvé — à compléter (probablement absents sur site)

## Paiement / langues / accessibilité
- Moyens de paiement : Sans objet (site gratuit)
- Langues : Non trouvé — à compléter (panneaux a priori en français)
- Accessibilité PMR : Non trouvé — à compléter ; sentier « très facile » quasi plat mais terrain naturel pouvant être boueux ⇒ accessibilité fauteuil non garantie, à vérifier sur le terrain

## Labels & classements (object_classification)
Aucun label revendiqué trouvé. Site inscrit dans le périmètre du Parc national de La Réunion (cœur/aire d'adhésion à préciser) et géré en partie par l'ONF — non assimilable à un label commercial type LBL_*. Aucun classement « Tourisme & Handicap » trouvé.

## Médias suggérés
- Photos sur les fiches Randopitons, ile-delareunion.com, monnuage.fr, et vidéo YouTube (watch?v=Qs9mKGBctbQ). NE PAS télécharger sans autorisation des ayants droit. Prévoir des prises de vue propres OTI du Sud (belvédère, panneaux botaniques, fanjans) lors d'une visite terrain.

## Données manquantes / à vérifier
- GPS exact du parking et du belvédère (géocodage BAN imprécis ; trace GPX Parc national à récupérer)
- Valeurs précises distance/dénivelé à arbitrer (1,7 vs 1,8 km ; 50 vs 61 m)
- Trace GPX/KML officielle pour `object_iti.geom` (PDF reunion-parcnational.fr non récupéré — erreur de certificat)
- Gestionnaire exact et contact (ONF / Parc national / Département) + statut foncier (forêt départementale dans aire d'adhésion ou cœur du Parc)
- Présence/absence de sanitaires, eau potable, restauration sur site
- Accessibilité PMR réelle
- Langues de la signalétique
- État/actualité de la signalétique (vandalisme mentionné)

## Sources
- Le sentier botanique de Notre Dame de la Paix — Randopitons (fiche randonnée 1016) — https://randopitons.re/randonnee/1016-sentier-botanique-notre-dame-paix — consulté le 2026-06-26
- Sentier botanique de Notre Dame de la Paix — Randopitons (tourisme 243, GPS -21.26722 / 55.60125) — https://randopitons.re/tourisme/243-sentier-botanique-notre-dame-paix — consulté le 2026-06-26
- Forêt Notre Dame de la Paix - Sentier botanique — ile-delareunion.com (distance 1,8 km, dénivelé 61 m, altitude 1685 m, Parc national) — https://www.ile-delareunion.com/fr/decouvrir/foret-nd-de-la-paix.html — consulté le 2026-06-26
- Forêts et sentiers botaniques — Offices de tourisme du Sud (sudreuniontourisme.fr ; gestion ONF, accès RD36) — https://www.sudreuniontourisme.fr/tresors-du-sud/forets-et-sentiers-botaniques.html — consulté le 2026-06-26
- Sentier botanique Notre-Dame de la Paix — fiche Parc national de La Réunion (PDF trek 6311 ; non récupéré, erreur certificat) — https://randotectec.reunion-parcnational.fr/data/api/fr/treks/6311/sentier-botanique-notre-dame-de-la-paix.pdf — consulté le 2026-06-26
- Le sentier botanique de Notre-Dame de la Paix — Carte de La Réunion — https://www.cartedelareunion.fr/listings/le-sentier-botanique-de-notre-dame-de-la-paix/ — consulté le 2026-06-26
- Géocodage BAN api-adresse.data.gouv.fr (citycode 97422, confirme commune Le Tampon ; point exact non résolu) — https://api-adresse.data.gouv.fr/search/?q=Ch%C3%AAne+Notre+Dame+de+la+Paix+RD36&citycode=97422 — consulté le 2026-06-26
