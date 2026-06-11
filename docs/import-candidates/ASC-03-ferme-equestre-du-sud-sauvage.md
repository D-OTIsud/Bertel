# Ferme Équestre du Sud Sauvage — ASC (Activité sportive et culturelle — structure)

> Fiche candidate à l'import — recherche web du 2026-06-11. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : ASC
- name : Ferme Équestre du Sud Sauvage
- status : draft
- commune : Saint-Philippe (INSEE 97417)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : « Ferme équestre du Sud Sauvage » existe déjà en type **ACT** (id `ACTRUN00000000S3`, status `published` — vérifié en base le 2026-06-11 ; aucun homologue ASC trouvé) — c'est la prestation ; la présente fiche est la STRUCTURE (ASC). À relier plutôt qu'à fusionner.

## Identité
- Catégorie / sous-type proposé : Ferme équestre / centre de tourisme équestre (balades à cheval et poney, promenades en calèche, élevage équin)
- Chapo : Ferme équestre familiale de Saint-Philippe, dans le Sud sauvage, proposant des activités autour du cheval et du poney — balades et promenades en calèche — encadrées par Véronique, diplômée Galop 5 d'attelage.

## Description
La Ferme Équestre du Sud Sauvage est une exploitation agricole (EARL, élevage de chevaux et d'autres équidés) installée à Saint-Philippe, sur le littoral du Sud sauvage de La Réunion. Créée fin 2014 et toujours en activité d'après le registre national des entreprises, elle développe une activité de tourisme équestre à destination des particuliers et des groupes : approche du cheval et du poney pour les enfants, balades et promenades en calèche. Selon les fiches annuaires consultées, les activités d'attelage sont encadrées par Véronique, titulaire du Galop 5 d'attelage. La structure est référencée comme centre de tourisme équestre par Île de la Réunion Tourisme. Son siège social est déclaré à Basse Vallée (89 route Nationale 2), tandis que les annuaires localisent le site d'accueil au 4 chemin de la Pompe, toujours sur la commune de Saint-Philippe (97442) ; cette double adresse est à clarifier avant import. Le site web officiel de la structure (fermeequestresudsauvage.com, avec une page tarifs) était inaccessible le jour de la recherche, ce qui laisse plusieurs champs à compléter : coordonnées téléphoniques, horaires, grille tarifaire et modalités de réservation sont à confirmer directement auprès de l'exploitant ou via l'OTI du Sud.

## Adresse & localisation (object_location)
- Adresse : siège social : Basse Vallée, 89 route Nationale 2 (registre national des entreprises) ; site d'accueil selon annuaires : « 4 chemin Pompe » (EasyRode) / « 4 rue Pompe » (Mappy) — la voie officielle BAN est « Rue de la Pompe » (la graphie « chemin de la Pompe » n'existe pas dans la BAN) ; divergence siège/accueil à clarifier
- Code postal / ville : 97442 Saint-Philippe
- GPS (WGS84) : -21.370536, 55.714960 — source : géocodage BAN (api-adresse.data.gouv.fr) de l'adresse du siège « 89 route Nationale 2 Basse Vallée 97442 Saint-Philippe », score 0,96, citycode 97417 (re-vérifié le 2026-06-11, valeurs identiques). Site d'accueil : « 4 Rue de la Pompe 97442 Saint-Philippe » géocodé BAN (housenumber, citycode 97417) → -21.363952, 55.769846 — à confirmer comme point d'activité avant import (les deux points sont bien sur la commune de Saint-Philippe).
- Altitude : Non trouvé — à compléter

## Contacts (object_contact)
- Téléphone : Non trouvé — à compléter (des numéros en 0692/0693 apparaissent dans des extraits d'annuaires non consultables — Pages Jaunes renvoie HTTP 403 ; à vérifier)
- Email : Non trouvé — à compléter
- Site web : https://fermeequestresudsauvage.com/ (inaccessible le 2026-06-11 — ECONNREFUSED ; à re-tester)
- Réseaux sociaux : page Facebook « Ferme équestre du sud sauvage » (https://www.facebook.com/p/Ferme-%C3%A9questre-du-sud-sauvage-100040988959085/)

## Horaires (object_opening)
Non trouvé — à compléter (activités sur réservation présumées)

## Tarifs (object_price)
Non trouvé — à compléter (une page « Nos tarifs » existe sur le site officiel, inaccessible le 2026-06-11)

## Données spécifiques ASC
- Activités proposées : balades à cheval et à poney ; promenades en calèche ; élevage de chevaux (activité principale déclarée, NAF 01.43Z). Détail des formules : Non trouvé — à compléter.
- Publics accueillis : enfants (poneys) et adultes, cavaliers novices ou expérimentés selon les annuaires ; accueil de groupes mentionné — âge minimum : Non trouvé — à compléter.
- Encadrement : Véronique, diplômée « Galop 5 d'attelage » pour les activités de calèche (fiches EasyRode / IRT) ; diplômes professionnels (BPJEPS/ATE) : Non trouvé — à compléter.
- Périodes / jours de fonctionnement : Non trouvé — à compléter.
- Niveau requis : Non trouvé — à compléter (balades a priori accessibles aux débutants).

## Équipements & services (object_amenity)
Non trouvé — à compléter (calèche(s) ; installations de la ferme à inventorier)

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter
- Langues parlées : Non trouvé — à compléter (français présumé)
- Accessibilité PMR : Non trouvé — à compléter

## Labels & classements (object_classification)
Aucun trouvé (affiliation FFE/CRE Réunion et labellisation éventuelle à vérifier)

## Médias suggérés
- Photos sur la page Facebook officielle et sur fermeequestresudsauvage.com quand il sera de nouveau accessible (NE PAS télécharger sans autorisation)

## Données manquantes / à vérifier
- Téléphone et email (site officiel hors ligne le 2026-06-11 ; Pages Jaunes non consultable — fiche pro 57329151 à ouvrir manuellement)
- Adresse du site d'accueil (BAN : « 4 Rue de la Pompe » → -21.363952, 55.769846 vs siège à Basse Vallée 89 RN2 → -21.370536, 55.714960) : confirmer lequel des deux points est le lieu d'accueil du public
- Tarifs, horaires, formules d'activités, âge minimum, niveau requis
- Diplômes d'encadrement professionnels (le Galop 5 d'attelage est une qualification fédérale de cavalier, pas un diplôme d'encadrement — point réglementaire à clarifier avec la structure)
- État réel de l'activité touristique en 2026 (l'EARL est administrativement active ; le site web hors ligne incite à confirmer que l'accueil du public continue)
- Lien avec l'objet ACT existant « Ferme équestre du Sud Sauvage » (ACTRUN00000000S3) à modéliser (structure ↔ prestation)

## Sources
- EARL FERME EQUESTRE DU SUD SAUVAGE — Annuaire des Entreprises (data.gouv.fr) : SIREN 808 397 301, NAF 01.43Z, créée le 15/12/2014, en activité, siège Basse Vallée 89 RN2 97442 Saint-Philippe — https://annuaire-entreprises.data.gouv.fr/entreprise/earl-ferme-equestre-du-sud-sauvage-808397301 — consulté le 2026-06-11
- Ferme équestre du Sud Sauvage — fiche EasyRode (adresse 4 chemin Pompe, encadrement Véronique Galop 5 attelage) — https://www.easyrode.com/reunion-annuaire/974/professionnel-Saint-Philippe/Centre-d-equitation/FermeequestreduSudSauvage — consulté le 2026-06-11
- Ferme Equestre Du Sud Sauvage EARL — Mappy (4 rue Pompe, 97442 Saint-Philippe, élevage de chevaux) — https://fr.mappy.com/poi/59b11cec0351d16f3656404a — consulté le 2026-06-11
- Ferme équestre du Sud Sauvage (Saint-Philippe) — Île de la Réunion Tourisme (IRT) — https://en.reunion.fr/offers/ferme-equestre-du-sud-sauvage-saint-philippe-en-2591028/ — consulté le 2026-06-11 (fiche existante, contenu détaillé non chargeable au fetch)
- Ferme Equestre Sud Sauvage — site officiel — https://fermeequestresudsauvage.com/ — tentative de consultation le 2026-06-11 (inaccessible, ECONNREFUSED)
- Géocodage BAN — https://api-adresse.data.gouv.fr/search/?q=89+route+nationale+2+basse+vallee+97442+saint-philippe — consulté le 2026-06-11
