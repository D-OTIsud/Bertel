# Manapany Festival — FMA (Fête / manifestation)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : FMA
- name : Manapany Festival
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 sur `public.object`, filtres `name ILIKE '%manapany%' / '%festival%' / '%peaks%'`). Les seules occurrences « Manapany » sont des hébergements/restaurants (HLO « Les Terrasses de Manapany », « Villas Manapany », « Manapany Lodge », « Manapany Team » ; RES « CAP MANAPANY ») — aucun objet FMA/événement homonyme. Pas de doublon avec les fiches déjà proposées. Aucune action de déduplication requise.

## Identité
- Catégorie / sous-type proposé : Festival culturel et musical (à l'origine « Manapany Surf Festival » — événement sportif/surf reconverti en festival musical et culturel après l'interdiction préfectorale des activités nautiques en 2014). Volet sportif et environnemental conservé.
- Chapo : Rendez-vous culturel et festif majeur du Sud Sauvage, le Manapany Festival anime chaque mois de septembre la baie de Manapany-les-Bains à Saint-Joseph : trois jours de concerts gratuits en journée, spectacles, animations sportives et engagement environnemental.

## Description
Le Manapany Festival est un festival annuel organisé par l'association réunionnaise « Les 3 Peaks », qui se tient autour de la baie de Manapany-les-Bains, sur le territoire de la commune de Saint-Joseph. Créé sous le nom de « Manapany Surf Festival » (compétitions de bodyboard, dropknee et surf), il a été rebaptisé en 2014 à la suite de l'interdiction préfectorale des activités nautiques liée aux attaques de requins autour de l'île, et s'est alors recentré sur la programmation musicale et culturelle. Il se déroule sur trois jours en septembre et propose des concerts d'artistes principalement issus de la scène réunionnaise et de l'océan Indien (chanson, ska, musiques de l'océan Indien), répartis sur deux scènes. Les concerts de journée sont gratuits, seules les soirées sur la scène « Ti Coin Charmant » étant payantes. Le festival conserve un fort volet sportif (skate, tchoukball, randonnée, sports de combat, basket, natation, zumba, boxing gym, capoeira, sports adaptés) et un engagement affirmé en faveur de la protection de l'environnement et du développement durable, l'association ayant à cœur de préserver l'écosystème de la baie de Manapany.

## Adresse & localisation (object_location)
- Adresse : Baie / bassin de Manapany-les-Bains, rue François Martin (et abords du front de mer), Manapany-les-Bains
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.378092, 55.599474 — source : géocodage BAN (api-adresse.data.gouv.fr), requête « rue Francois Martin Manapany », citycode 97412, score 0.967, postcode 97480, label « Rue Francois Martin Manapany 97480 Saint-Joseph ». Point indicatif au cœur du quartier de Manapany-les-Bains, à proximité du bassin aménagé — emprise exacte de l'événement à confirmer.
- Altitude : Non trouvé — à compléter (site littoral, proche du niveau de la mer)

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (NB : 0262 22 11 00 est le numéro du réseau de transport pour les navettes, pas celui de l'organisateur)
- Email : Non trouvé — à compléter
- Site web : https://www.manapanyfestival.com/ (source : Wikipédia ; site non accessible au scraping le 2026-06-26 — HTTP 403)
- Réseaux sociaux : Facebook https://www.facebook.com/manapanyfestival/ ; Instagram https://www.instagram.com/manapanyfestival/ (source : résultats de recherche web du 2026-06-26)

## Horaires (object_opening)
- Festival annuel, sur ~3 jours en septembre (vendredi à dimanche). Dates précises variables selon l'édition — à reconfirmer chaque année.
- Repère horaire (édition 2019, via navettes mairie) : vendredi à partir de la soirée (navettes 18h30–02h00), samedi en journée et soirée (navettes 09h00–02h00), dimanche en journée (navettes 06h00–23h30).
- Concerts de journée en accès libre ; soirées sur la scène « Ti Coin Charmant » en horaires de soirée.
- Dates de l'édition à venir : Non trouvé — à compléter (site officiel inaccessible le 2026-06-26)

## Tarifs (object_price)
- Accès aux scènes et animations de journée : GRATUIT (entrée libre) — source : guide-reunion.fr / Habiter La Réunion.
- Soirées concerts sur la scène « Ti Coin Charmant » : PAYANT — montant et validité Non trouvé — à compléter (tarifs par édition, à reconfirmer chaque année).
- Navettes et parkings : gratuits pendant le week-end du festival (source : mairie de Saint-Joseph).

## Données spécifiques FMA (object_fma + occurrences)
- Périodicité : annuelle
- Mois : septembre
- Durée : ~3 jours (vendredi → dimanche)
- Lieu : baie / site de Manapany-les-Bains, Saint-Joseph (deux scènes, dont « Ti Coin Charmant »)
- Type d'événement : festival musical et culturel (musique : chanson, ska, musiques de l'océan Indien ; scène majoritairement réunionnaise) + volet sportif (skate, tchoukball, randonnée, sports de combat, basket, natation, zumba, boxing gym, capoeira, sports adaptés) + volet environnemental / développement durable
- Organisateur : association « Les 3 Peaks » (Les Trois Peaks de Manapany)
- Édition : 19e édition recensée (source : LINFO.re / dossier ville de Saint-Joseph) ; ~18 éditions en 2018 (Wikipédia). Année de l'édition à venir / dates exactes : Non trouvé — à compléter.

## Équipements & services (object_amenity)
- Parking : oui — parkings gratuits dédiés (Collège Achille Grondin, centre des Arts du feu, magasin de bricolage près de l'arrêt « Lycée Agricole ») desservis par navettes gratuites (source : mairie de Saint-Joseph, édition 2019).
- Navettes gratuites depuis les parkings relais.
- Restauration / sanitaires / accès PMR sur site : Non trouvé — à compléter.
- Site littoral avec bassin de baignade aménagé à proximité (équipement du site, hors emprise festival).

## Paiement / langues / accessibilité
- Moyens de paiement (billetterie soirées) : Non trouvé — à compléter
- Langues : français / créole réunionnais (présumé ; à confirmer)
- Accessibilité PMR : Non trouvé — à compléter (le festival propose des « sports adaptés » dans sa programmation, mais l'accessibilité du site n'est pas documentée)

## Labels & classements (object_classification)
- Aucun label officiel revendiqué trouvé. Démarche d'éco-responsabilité / réduction de l'impact environnemental affichée par l'association Les 3 Peaks (non labellisée à ce stade) — à vérifier auprès de l'organisateur. Aucun mapping LBL_* applicable en l'état.

## Médias suggérés
- Photos officielles disponibles sur le site et les réseaux du festival : https://www.manapanyfestival.com/ , https://www.facebook.com/manapanyfestival/ , https://www.instagram.com/manapanyfestival/ — NE PAS télécharger sans autorisation.
- Aucune URL d'image libre de droits identifiée. Médias à demander à l'organisateur (association Les 3 Peaks) ou à l'OTI du Sud.

## Données manquantes / à vérifier
- Dates exactes et numéro de l'édition à venir (site officiel inaccessible le 2026-06-26).
- Coordonnées de l'organisateur (téléphone / email de l'association Les 3 Peaks).
- Emprise géographique précise de l'événement et localisation exacte des deux scènes (dont « Ti Coin Charmant ») ; GPS de précision et altitude.
- Programmation musicale détaillée (artistes), tarifs de billetterie des soirées et moyens de paiement.
- Équipements sur site (restauration, sanitaires, accès PMR), fréquentation, langues.
- Statut d'éventuels labels / éco-label événementiel.
- Confirmation que l'événement est bien maintenu / programmé pour les éditions à venir.

## Sources
- Manapany Festival — Wikipédia — https://fr.wikipedia.org/wiki/Manapany_Festival — consulté le 2026-06-26
- Manapany Festival : Navettes et parkings gratuits (Ville de Saint-Joseph) — https://saintjoseph.re/Manapany-Festival-Navettes-et?version=classique — consulté le 2026-06-26
- Manapany-les-Bains — Offices de tourisme du Sud (sudreuniontourisme.fr) — https://www.sudreuniontourisme.fr/tresors-du-sud/manapany-les-bains.html — consulté le 2026-06-26
- Manapany Festival — guide-reunion.fr — https://guide-reunion.fr/evenements/eve/manapany-festival/ — consulté le 2026-06-26
- Manapany Festival — Habiter La Réunion — https://habiter-la-reunion.re/manapany-festival/ — consulté le 2026-06-26
- « Manapany festival » : une 19e édition organisée par Les 3 Peaks — LINFO.re (dossier Ville de Saint-Joseph) — https://www.linfo.re/dossiers-partenaires/ville-de-saint-joseph/c-saint-jo-19e-edition-de-manapany-festival-organisee-par-les-3-peaks — consulté le 2026-06-26
- Géocodage BAN (api-adresse.data.gouv.fr), requête « rue Francois Martin Manapany », citycode 97412 — https://api-adresse.data.gouv.fr/search/?q=rue+Francois+Martin+Manapany&citycode=97412 — consulté le 2026-06-26
