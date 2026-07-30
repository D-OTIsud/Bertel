# Le Nirvana — RES (Restauration)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : RES
- name : Le Nirvana
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun. Vérification SQL live du 2026-06-26 (`name ILIKE '%nirvana%'` et `'%langevin%'`) : aucune fiche « Nirvana ». Les 3 objets « Langevin » en base sont distincts (HLO Lilie location saisonnière ; ACT Parc Piscicole ; PRD Terroir de Bras Sec). Établissement dans le périmètre OTI du Sud (Langevin, Saint-Joseph, INSEE 97412) ✓.

## Identité
- Catégorie / sous-type proposé : Restaurant — cuisine créole / cuisine régionale (« lontan »), avec touches chinoises. Établissement de plein air, cadre panoramique privatisable.
- Chapo : Perché sur les hauteurs de la cascade Jacqueline, à l'embouchure de la rivière Langevin, ce restaurant créole de plein air offre une vue spectaculaire sur la ravine et l'océan Indien, dans un jardin tropical avec piscine.

## Description
Le Nirvana est un restaurant de plein air implanté sur les hauteurs de la cascade Jacqueline, dans la vallée de Langevin (Saint-Joseph). Aménagé sur deux niveaux autour d'une petite piscine centrale, dans un jardin tropical planté de palmiers et d'arbres fruitiers, il domine l'embouchure de la rivière Langevin et offre une vue panoramique sur l'océan Indien et la cascade Jacqueline. La cuisine est créole et « lontan » (traditionnelle), avec des plats faits maison et copieux à base de produits locaux : poulet palmiste, chou de vacoa boucané, poisson sauce vanille, rougail saucisse, dakatine, ainsi que quelques préparations d'inspiration chinoise (chop suey). L'établissement propose aussi la privatisation des lieux pour événements, séminaires et team building. La réservation est conseillée. (Sources : Whereez, Petit Futé, TripAdvisor, ATABLE.re, Facebook.)

## Adresse & localisation (object_location)
- Adresse : 1 Impasse de la Digue, Langevin
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.3848456, 55.6449892 — source : OpenStreetMap (node osm_id 9245528917, « Le nirvana », type restaurant). Corroboré par géocodage BAN api-adresse.data.gouv.fr (« 1 Impasse de la Digue 97480 Saint-Joseph », lat -21.383353 / lon 55.645196, score 0.72, citycode 97412, type housenumber — l'API renvoie [lon, lat] ; valeurs cohérentes à ~200 m près).
- Altitude : Non trouvé — à compléter (situé « sur les hauteurs » de la cascade Jacqueline, au-dessus de l'embouchure de la rivière Langevin ; altitude exacte non sourcée).

## Contacts (object_contact)
- Téléphone : +262 692 35 91 09 (source : TripAdvisor, ATABLE.re)
- Email : Non trouvé — à compléter
- Site web : Non trouvé — à compléter (pas de site officiel identifié ; présence via plateformes tierces)
- Réseaux sociaux :
  - Facebook : https://www.facebook.com/RestaurantLeNirvana/ (« Restaurant Le Nirvâna | Langevin Réunion »)
  - Instagram : @restaurant_le_nirvana_ (source : ATABLE.re)

## Horaires (object_opening)
- Jeudi à samedi + lundi : 11h30 – 21h00
- Dimanche, mardi : 11h30 – 17h00
- Mercredi : fermé
(Source : Petit Futé / Vos Propres Ailes, recherche web 2026-06-26. À CONFIRMER auprès de l'établissement — les horaires des restaurants varient et ne sont pas attestés par une source officielle. Réservation conseillée.)

## Tarifs (object_price)
- Plats à partir de 15 € (source : Petit Futé, recherche web 2026-06-26).
- Gamme de prix indicative : $$ – $$$ (source : TripAdvisor).
- Carte / menu détaillé daté : Non trouvé — à compléter.

## Données spécifiques RES
RES n'a pas de table de facette type-spécifique unique : la restauration se modélise via les blocs génériques (object_cuisine_type / object_menu / object_menu_item, équipements, capacité). Données collectées :
- Type de cuisine : créole / « lontan » (traditionnelle réunionnaise), avec plats d'inspiration chinoise.
- Spécialités citées (sources Whereez / Petit Futé / TripAdvisor) : poulet palmiste, chou de vacoa boucané, poisson sauce vanille, poulet dakatine, rougail saucisse, cari bichiques, chop suey, salade de palmiste, jus de fruits frais, punch local, desserts maison.
- Capacité d'accueil : niveau supérieur jusqu'à 70 personnes ; les deux niveaux combinés jusqu'à 140 personnes (source : Whereez — capacité d'événement privatisé).
- Privatisation : oui — location pour événements privés, séminaires, team building (source : Whereez).
- Particularités du lieu : restaurant de plein air sur deux niveaux, piscine centrale, jardin tropical (palmiers, arbres fruitiers), vue cascade Jacqueline + embouchure rivière Langevin + océan.

## Équipements & services (object_amenity)
- Terrasse / places en extérieur (outdoor seating) — source : TripAdvisor.
- Bar complet avec rhums arrangés — source : TripAdvisor.
- Piscine (petite piscine centrale) — source : Whereez / Petit Futé.
- Service à table, service du midi, réservations acceptées — source : TripAdvisor.
- Parking : Non trouvé — à compléter.
- Sanitaires : Non trouvé — à compléter.

## Paiement / langues / accessibilité
- Moyens de paiement : cartes de crédit acceptées (source : TripAdvisor). Autres moyens : Non trouvé — à compléter.
- Langues : Non trouvé — à compléter (français présumé ; non sourcé).
- Accessibilité PMR : Non trouvé — à compléter (établissement de plein air sur deux niveaux et terrain en hauteur — accessibilité incertaine, à vérifier sur le terrain).

## Labels & classements (object_classification)
Aucun trouvé. Pas de label (Maître Restaurateur, Qualité Tourisme, etc.) ni classement revendiqué dans les sources consultées. Non référencé sur sudreuniontourisme.fr ni reunion.fr au 2026-06-26.

## Médias suggérés
- Page Facebook (photos) : https://www.facebook.com/RestaurantLeNirvana/photos/ — NE PAS télécharger sans autorisation.
- Fiche TripAdvisor (photos d'usagers) : https://www.tripadvisor.com/Restaurant_Review-g17157705-d21349819-Reviews-Le_Nirvana-Langevin_Arrondissement_of_Saint_Pierre.html — NE PAS télécharger sans autorisation.
- Vidéo YouTube « Restaurant Le Nirvana, Langevin » : https://www.youtube.com/watch?v=uPWhL0Vpqq0 — NE PAS réutiliser sans autorisation.
- Privilégier des photos fournies directement par l'établissement (droits à obtenir).

## Données manquantes / à vérifier
- Altitude du point d'accès / de la terrasse.
- Email et site web officiel (aucun identifié).
- Horaires exacts et saisonniers (confirmer auprès de l'établissement ; source secondaire uniquement).
- Carte/menu détaillé et tarifs datés au-delà de « à partir de 15 € ».
- Moyens de paiement complets (espèces, chèques, tickets resto ?).
- Langues parlées.
- Accessibilité PMR (terrain en hauteur, deux niveaux).
- Parking et sanitaires.
- Statut juridique / SIRET / raison sociale de l'exploitant (pour object_legal).
- Capacité de couverts en service courant (vs capacité événementielle 70/140).
- Confirmation que l'établissement est toujours en activité en 2026 (dernières traces : reviews TripAdvisor, page Facebook active).

## Sources
- Petit Futé — Le Nirvana, Langevin (97480) — https://www.petitfute.co.uk/v41125-langevin-97480/c1165-restaurants/c1029-cuisine-regionale/1985325-le-nirvana.html — consulté le 2026-06-26 (page directe HTTP 402 ; données via résultats de recherche et page Vos Propres Ailes).
- TripAdvisor — LE NIRVANA, Langevin (adresse, téléphone, cuisine, équipements, avis) — https://www.tripadvisor.com/Restaurant_Review-g17157705-d21349819-Reviews-Le_Nirvana-Langevin_Arrondissement_of_Saint_Pierre.html — consulté le 2026-06-26.
- Whereez — « Privatisez la plus belle vue du Sud Sauvage : Le Nirvana » (cadre, capacité, privatisation, spécialités) — https://whereez.com/en/product/privatise-the-most-beautiful-view-of-the-wild-south-nirvana — consulté le 2026-06-26.
- ATABLE.re — Le Nirvana (adresse, téléphone, Instagram, cuisine) — https://atable.re/restaurant/le-nirvana/ — consulté le 2026-06-26.
- Facebook — Restaurant Le Nirvâna, Langevin Réunion — https://www.facebook.com/RestaurantLeNirvana/ — consulté le 2026-06-26.
- OpenStreetMap (Nominatim) — node « Le nirvana » osm_id 9245528917, lat -21.3848456 / lon 55.6449892 — https://nominatim.openstreetmap.org/search?q=Le+Nirvana+restaurant+Langevin+Saint-Joseph — consulté le 2026-06-26.
- BAN / api-adresse.data.gouv.fr — géocodage « 1 Impasse de la Digue 97480 Saint-Joseph » (citycode 97412, score 0.72) — https://api-adresse.data.gouv.fr/search/?q=1%20Impasse%20de%20la%20Digue%20Langevin%2097480%20Saint-Joseph&citycode=97412 — consulté le 2026-06-26.
