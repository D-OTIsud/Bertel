# Complexe Sportif et Ludique Henri Ganofsky — ASC (Activité de sport, culture et loisirs)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ASC
- name : Complexe Sportif et Ludique Henri Ganofsky
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud (`ORGRUN000000000B`)
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 — recherche `name ILIKE '%ganofsky%' / '%gano%' / '%complexe sportif%' / '%skate%' / '%nautique%' / '%street work%'` ⇒ 0 ligne ; absent aussi de la liste « déjà proposé »). Le « Centre nautique / piscine » voisin et le « Stade Raphaël Babet » sont des équipements distincts du même secteur (à ne pas confondre, mais non présents en base non plus).

## Identité
- Catégorie / sous-type proposé : Équipement sportif et ludique municipal de plein air (skatepark + aire de jeux + street workout + plateaux multisports + gymnase), accès loisirs grand public.
- Chapo : Inauguré fin 2019 à côté du centre nautique de Saint-Joseph, le complexe Henri Ganofsky réunit sur près de 3 000 m² un skatepark (avec bowl), une aire de jeux pour enfants, des agrès de street workout et des plateaux multisports — l'un des spots de glisse urbaine emblématiques du Sud Sauvage.

## Description
Le Complexe Sportif et Ludique Henri Ganofsky est un équipement municipal de plein air aménagé par la Ville de Saint-Joseph, inauguré le 14 décembre 2019 après cinq mois de travaux (coût d'environ 690 000 € HT). Il s'étend sur près de 3 000 m² et a été conçu avec la participation des conseils municipaux d'enfants, de collégiens et de lycéens, qui ont apporté avis et souhaits sur le projet. L'aménagement réunit une aire de jeux pour enfants à sol amortissant, des agrès de street workout, et un skatepark doté de modules et d'un bowl (« pool » à rebords) — décrit par plusieurs sources de la communauté skate comme le seul bowl de ce type sur l'île. Il jouxte le gymnase omnisports Henri Ganofsky (salle EPS + terrain parquet), un boulodrome et deux plateaux polyvalents enrobés (basket, handball, volley, tennis), ainsi que le centre nautique municipal. Le site accueille aussi le « GanoFestival », festival de sports urbains (skate, roller, street workout, street art, basket) co-organisé avec l'association Maillegraine.

## Adresse & localisation (object_location)
- Adresse : 1 rue du Centre Nautique
- Code postal / ville : 97480 Saint-Joseph
- GPS (WGS84) : -21.376682, 55.624696 — source : géocodage BAN api-adresse.data.gouv.fr, requête « rue du Centre Nautique Saint-Joseph » (citycode 97412, type=street) → label « Rue du Complexe Nautique 97480 Saint-Joseph », score 0,628 ; corroboré par le géocodage de « 1 rue du Centre Nautique » (lat -21.375704, lon 55.624383, score 0,67). NB : la BAN référence la voie sous le libellé « rue du Complexe Nautique » ; point à affiner sur le terrain (l'entrée précise du skatepark/aire de jeux peut différer du centroïde de voie).
- Altitude : Non trouvé — à compléter (secteur littoral de Saint-Joseph, ordre de grandeur faible mais non vérifié).

## Contacts (object_contact)
- Téléphone : 02 62 31 45 18 — source : site officiel saintjoseph.re (page « Les salles et gymnases ») ; confirmé par la page « Sport & loisirs ».
- Email : Non trouvé — à compléter (l'accueil sport de la mairie ; un contact festival existe : maillegraine@gmail.com / 0692 26 46 08, mais c'est l'association GanoFestival, pas le gestionnaire de l'équipement).
- Site web : https://saintjoseph.re/Les-salles-et-gymnases (page municipale de l'équipement ; pas de site dédié).
- Réseaux sociaux : Non trouvé — à compléter.

## Horaires (object_opening)
Non trouvé — à compléter. Les horaires d'ouverture/accès des espaces de plein air (skatepark, aire de jeux, street workout) ne sont pas publiés sur les sources consultées ; le gymnase et les terrains sont gérés en créneaux par le service des sports municipal (à confirmer par téléphone au 02 62 31 45 18). Accès libre supposé pour le skatepark/aire de jeux mais NON confirmé.

## Tarifs (object_price)
Non trouvé — à compléter. Équipement municipal de plein air : l'accès au skatepark, à l'aire de jeux et aux agrès de street workout est vraisemblablement gratuit (à confirmer) ; les créneaux du gymnase peuvent être soumis à réservation/convention via la mairie (non confirmé).

## Données spécifiques ASC (object_act)
- Activités proposées : skateboard / roller / trottinette (skatepark avec modules + bowl) ; street workout (agrès) ; aire de jeux enfants ; basket / handball / volley / tennis (plateaux polyvalents enrobés) ; pétanque (boulodrome) ; activités en salle (EPS, omnisports parquet — gymnase Henri Ganofsky attenant).
- Publics : tous publics ; familles et enfants (aire de jeux à sol amortissant) ; pratiquants de glisse urbaine et de fitness ; scolaires (gymnase). Source : Imaz Press / site municipal (« pour tous les âges et tous les goûts »).
- Encadrement : Non trouvé — à compléter. Accès libre en autonomie présumé pour les espaces de plein air ; pas d'encadrement permanent identifié. Encadrement ponctuel lors d'événements (ex. GanoFestival, association Maillegraine).
- Capacité / dimensions : ensemble ~3 000 m² (skatepark + aire de jeux + street workout). Gymnase attenant : capacité 1 203 personnes sur 1 947 m² (source saintjoseph.re). Skatepark : revêtement béton, modules + bowl. Surface précise par espace : Non trouvé — à compléter.

## Équipements & services (object_amenity)
- Skatepark béton (modules + bowl), aire de jeux enfants (sol amortissant), agrès de street workout — confirmés.
- Boulodrome, deux plateaux polyvalents enrobés (basket/handball/volley/tennis), gymnase omnisports (salle EPS + parquet) — confirmés.
- Centre nautique / piscine municipale à proximité immédiate (équipement distinct).
- Parking, sanitaires, point d'eau, éclairage, restauration : Non trouvé — à compléter.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (équipement municipal, accès plein air présumé gratuit).
- Langues : Non trouvé — à compléter (français présumé).
- Accessibilité PMR : Non trouvé — à compléter pour le complexe ludique. NB : le centre nautique voisin est décrit comme rénové « avec rampes d'accès pour personnes à mobilité réduite » (source saintjoseph.re), mais cela ne préjuge pas de l'accessibilité du skatepark/aire de jeux.

## Labels & classements (object_classification)
Aucun trouvé. Aucun label touristique ou classement revendiqué identifié sur les sources consultées.

## Médias suggérés
- Photos de l'inauguration et des installations (skatepark, bowl, aire de jeux, street workout) sur l'article Imaz Press : https://imazpress.com/actus-reunion/inauguration-dun-complexe-sportif-et-ludique-a-saint-joseph — NE PAS télécharger sans autorisation (droits Imaz Press / Ville de Saint-Joseph).
- Photos du skatepark sur les annuaires glisse (spotland, webvilles, cartes-2-france) — NE PAS télécharger sans autorisation.
- Recommandation : solliciter le service communication de la Ville de Saint-Joseph pour des visuels libres de droits.

## Données manquantes / à vérifier
- Horaires d'accès précis (skatepark / aire de jeux / gymnase) et statut « accès libre vs créneaux ».
- Tarification (gratuité de l'accès plein air, conditions de réservation du gymnase).
- Email de contact du gestionnaire (service des sports) et réseaux sociaux.
- Altitude exacte et point GPS précis de l'entrée du skatepark (le géocodage BAN pointe le centroïde de la voie « rue du Complexe Nautique » ; libellé de voie BAN ≠ libellé municipal « rue du Centre Nautique » — à réconcilier).
- Parking, sanitaires, accessibilité PMR du complexe ludique.
- Encadrement / clubs résidents ; périodicité et statut actuel du GanoFestival.

## Sources
- Ville de Saint-Joseph — « Les salles et gymnases » (équipements, adresse, téléphone, capacité, plateaux) — https://saintjoseph.re/Les-salles-et-gymnases — consulté le 2026-06-26
- Ville de Saint-Joseph — « Sport & loisirs » (confirmation équipement, complexe Henri Ganofsky, contact) — https://saintjoseph.re/+-Sport-loisirs-19-+ — consulté le 2026-06-26
- Imaz Press Réunion — « Inauguration d'un complexe sportif et ludique à Saint-Joseph » (aire de jeux, street workout, skatepark + bowl, ~3 000 m², 5 mois, 690 000 € HT, inauguration 14/12/2019) — https://imazpress.com/actus-reunion/inauguration-dun-complexe-sportif-et-ludique-a-saint-joseph — consulté le 2026-06-26
- Ville de Saint-Joseph — « GanoFestival » (festival de sports urbains au complexe Henri Ganofsky, association Maillegraine) — https://saintjoseph.re/GanoFestival — consulté le 2026-06-26
- cartes-2-france.com — « Skate Park, Saint-Joseph (97480) » (skatepark béton, bowl, mention « seul bowl de l'île ») — https://www.cartes-2-france.com/activites/974120043/skate-park.php — consulté le 2026-06-26
- BAN — api-adresse.data.gouv.fr (géocodage, citycode 97412 ; label « rue du Complexe Nautique », lat/lon, score) — https://api-adresse.data.gouv.fr/search/?q=rue%20du%20Centre%20Nautique%20Saint-Joseph&citycode=97412&type=street — consulté le 2026-06-26
