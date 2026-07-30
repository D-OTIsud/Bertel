# Gymnase de Vincendo — ASC (Activité sportive / culturelle)

> ## ⚠️ PERTINENCE TOURISTIQUE FAIBLE — écartement recommandé (réévaluation du 2026-07-30)
>
> **L'équipement existe bien** (confirmé le 2026-07-30) : il s'agit du **Gymnase du Lycée de Vincendo**, rue de la Marine, mis en service en **1999** — salle multisports 40 × 25 m à sol synthétique (500 m²), tribune de 400 places, 4 vestiaires-douches, mur d'escalade, 20 places de parking dont 2 PMR ; ouvert lun→ven 8h–21h et sam 8h–17h ; accueille gymnastique, boxe, badminton, volley, basket, handball et escalade (sources : saintjoseph.re « Les salles et gymnases », répertoire des équipements sportifs, sportenfrance.fr).
>
> **Mais son intérêt pour un VISITEUR est quasi nul** : c'est un gymnase scolaire et municipal, sans programmation ouverte au public de passage, sans billetterie ni offre de découverte. Il ne relève pas de l'offre touristique que l'OTI publie.
>
> **Recommandation : ne pas importer** (ou, si l'OTI veut couvrir les équipements de proximité pour ses résidents, l'importer sciemment dans ce registre — décision PO). Fiche conservée pour trace de la vérification.
>
> ---
>
> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : ~~À RÉVISER~~ → **pertinence faible, écartement recommandé**.

## Proposition d'import
- object_type : ASC
- name : Gymnase de Vincendo
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : aucun repéré (vérification SQL live du 2026-06-26 : `SELECT … FROM object WHERE name ILIKE '%vincendo%' OR '%gymnase%' OR '%escalade%' OR '%salle%sport%'` → 0 ligne). Non présent non plus dans la liste « DÉJÀ PROPOSÉ ». **Réserve de pertinence** : équipement sportif municipal / de lycée (infrastructure générique). Sa valeur touristique repose essentiellement sur la facette « activité encadrée » (mur d'escalade SAE / club d'escalade) ; à confirmer par l'OTI avant import (cf. § Données manquantes).

## Identité
- Catégorie / sous-type proposé : Équipement sportif couvert (complexe gymnase + salle EPS + structure artificielle d'escalade). Rattachement type ASC via la facette `object_act` (activité sportive).
- Chapo : Complexe sportif de Vincendo (gymnase multisports, salle EPS et mur d'escalade) géré par la commune de Saint-Joseph, accessible PMR et support des activités du club d'escalade local.

## Description
Le gymnase de Vincendo est un complexe sportif couvert situé rue de la Marine à Vincendo, sur le territoire de Saint-Joseph, et associé au lycée polyvalent de Vincendo. Il regroupe trois équipements : un gymnase multisports d'environ 1000 m² (badminton, volley-ball, basket-ball, handball) doté d'une tribune de 400 places et de vestiaires/douches ; une salle EPS d'environ 180 m² (danse, gymnastique, musculation, boxe) ; et une structure artificielle d'escalade (SAE, env. 20 m de long, 5 m de haut, 100 m²) référencée auprès de la FFME. L'ensemble est géré par la commune de Saint-Joseph (gestionnaire principal : Commune) et déclaré accessible aux personnes à mobilité réduite (handicap moteur et sensoriel). Selon le Club Alpin Français de La Réunion, le mur d'escalade accueille des créneaux d'escalade encadrés (lundi et vendredi en soirée pour ados autonomes et adultes) — information à reconfirmer auprès du club/de la mairie. L'accès se fait depuis la rue de la Marine ; un parking d'une vingtaine de places (dont 2 PMR) dessert le site.

## Adresse & localisation (object_location)
- Adresse : Rue de la Marine, Vincendo
- Code postal / ville : 97480 Saint-Joseph (commune INSEE 97412)
- GPS (WGS84) : -21.376398, 55.668804 — source : géocodage BAN api-adresse.data.gouv.fr de « Rue de la Marine Vincendo Saint-Joseph » (citycode 97412), `geometry.coordinates` = [55.668804, -21.376398] (lon, lat), score 0.678, label « Rue de la Marine 97480 Saint-Joseph ». **Précision « rue » (pas de numéro)** : point au niveau de la voie, à recaler sur le bâtiment du gymnase sur le terrain / via OSM.
- Altitude : Non trouvé — à compléter (Vincendo littoral, secteur de basse altitude, à confirmer)

## Contacts (object_contact)
- Téléphone : 02 62 37 17 06 — source : site officiel Ville de Saint-Joseph (saintjoseph.re, fiche « gymnase Vincendo »). À confirmer : ligne de réservation municipale (Service des sports) vs accueil du site.
- Email : Non trouvé — à compléter (réservations généralement centralisées par le Service des sports de la mairie de Saint-Joseph)
- Site web : Non trouvé — à compléter (pas de site propre ; pages de référence : saintjoseph.re/Les-salles-et-gymnases)
- Réseaux sociaux : Non trouvé — à compléter

## Horaires (object_opening)
Non trouvé — à compléter (horaires officiels non publiés par la commune). Indications NON officielles à vérifier : Waze indique lun.–ven. 08:00–21:00 et sam. 08:00–17:00 (source non fiable, à ne pas reprendre tel quel). Créneaux escalade encadrés cités par le CAF Réunion : lundi et vendredi 18:30–20:30 (ados autonomes / adultes) — à reconfirmer auprès du club et de la mairie.

## Tarifs (object_price)
Non trouvé — à compléter. Équipement public municipal : accès généralement réservé aux scolaires, clubs et associations conventionnés ; modalités/tarifs de mise à disposition non publiés. À préciser : conditions d'accès au mur d'escalade pour les visiteurs/pratiquants individuels (probablement via adhésion à un club, à confirmer).

## Données spécifiques ASC (object_act)
- Activités praticables : badminton, volley-ball, basket-ball, handball, danse, gymnastique (artistique/rythmique), musculation, boxe anglaise, escalade (SAE).
- Activité « phare » touristique potentielle : escalade sur structure artificielle (mur SAE ~20 m long × 5 m haut, ~100 m², référencé FFME).
- Publics : scolaires (lycée de Vincendo), clubs et associations ; créneaux escalade « ados autonomes et adultes » cités par le CAF Réunion. Accueil de pratiquants individuels / touristes : Non trouvé — à compléter.
- Encadrement : Non trouvé — à compléter (encadrement via clubs/associations ; pas de prestataire commercial identifié sur place). Le mur d'escalade est rattaché à la FFME ; un club d'escalade utilise le site.
- Saisonnalité : Non trouvé — à compléter.

## Équipements & services (object_amenity)
- Parking : ~20 places, dont 2 places PMR — source : sportenfrance.fr / webvilles.net.
- Sanitaires / vestiaires : vestiaires sportifs (4 + 1 vestiaire arbitre cités) avec douches — source : sportenfrance.fr.
- Tribune : 400 places (gymnase) — source : sportenfrance.fr / webvilles.net.
- Éclairage : oui (salles et mur) — source : sportenfrance.fr.
- Restauration sur place : Non trouvé — à compléter (a priori aucune).
- Accès transport : desservi en bus — source : sportenfrance.fr (ligne/réseau à préciser).

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (équipement public, pas de billetterie identifiée).
- Langues : Non trouvé — à compléter.
- Accessibilité PMR : déclaré accessible PMR (handicap moteur et sensoriel ; aire de pratique adaptée + 2 places de parking PMR) — source : sportenfrance.fr / webvilles.net. À confirmer pour chacun des trois équipements (gymnase, salle EPS, mur d'escalade).

## Labels & classements (object_classification)
Aucun trouvé (aucun label touristique revendiqué). Rattachement institutionnel/sportif : structure d'escalade référencée FFME (Fédération Française de la Montagne et de l'Escalade) — donnée sportive, pas un label `LBL_*`.

## Médias suggérés
- Aucune photo officielle libre identifiée. Pages de référence avec visuels éventuels : saintjoseph.re/Les-salles-et-gymnases ; webvilles.net (fiche gymnase / mur d'escalade). NE PAS télécharger sans autorisation.
- Recommandation : solliciter le Service communication de la mairie de Saint-Joseph pour des visuels libres de droits.

## Données manquantes / à vérifier
- **Pertinence touristique (prioritaire)** : décision OTI — un gymnase municipal/de lycée relève de l'infrastructure générique ; ne retenir comme objet ASC que si la dimension « activité encadrée » (escalade/club, créneaux ouverts) le justifie réellement. Sinon, écarter.
- Horaires d'ouverture officiels et conditions d'accès public (vs réservé scolaires/clubs).
- Modalités et tarifs d'accès au mur d'escalade pour pratiquants individuels / touristes ; encadrement (club, diplômé, FFME) et coordonnées du club.
- Email et éventuel site/contact dédié à la réservation (Service des sports).
- Altitude exacte et recalage GPS sur le bâtiment (le géocodage est « rue », sans numéro).
- Confirmation des surfaces/capacités (sources tierces datées 2017, à valider).
- Nom canonique : « Gymnase de Vincendo » (mairie) vs « Gymnase du Lycée de Vincendo » / « Complexe sportif du lycée polyvalent de Vincendo » (répertoires nationaux) — trancher avec l'OTI.
- Statut foncier/gestion (commune vs Région pour la partie lycée) à clarifier pour le rattachement éditeur (object_org_link).

## Sources
- Les salles et gymnases — Ville de Saint-Joseph — https://saintjoseph.re/Les-salles-et-gymnases — consulté le 2026-06-26
- gymnase Vincendo (adresse « Rue de la Marine - Vincendo, 97480 Saint-Joseph », tél. 02 62 37 17 06) — Ville de Saint-Joseph — https://saintjoseph.re/+-gymnase-Vincendo-+ — consulté le 2026-06-26
- Gymnase du Lycée de Vincendo (surfaces, équipements, parking, PMR, sports) — sportenfrance.fr — https://www.sportenfrance.fr/dom/reunion/saint-joseph/974120004-gymnase-du-lycee-de-vincendo — consulté le 2026-06-26
- Mur d'escalade du gymnase de Vincendo (SAE, dimensions, PMR, FFME, gestionnaire Commune) — webvilles.net — https://www.webvilles.net/sports/activites/134588/mur-d-escalade-du-gymnase-de-vincendo-saint-joseph.php — consulté le 2026-06-26
- Escalade (créneaux SAE Vincendo, plateau sportif) — Club Alpin Français de La Réunion (CAF Run) — https://www.cafrun.fr/escalade — consulté le 2026-06-26
- Géocodage BAN « Rue de la Marine Vincendo Saint-Joseph » (lon 55.668804 / lat -21.376398, score 0.678, citycode 97412) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=Rue+de+la+Marine+Vincendo+Saint-Joseph&citycode=97412 — consulté le 2026-06-26
