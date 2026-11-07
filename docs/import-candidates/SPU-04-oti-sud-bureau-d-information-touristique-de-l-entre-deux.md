# OTI Sud — Bureau d'Information Touristique de l'Entre-Deux — SPU (Service public / accueil au public)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : OTI Sud — Bureau d'Information Touristique de l'Entre-Deux
- status : draft
- commune : Entre-Deux (INSEE 97403)
- publisher : object_org_link [publisher] → OTI du Sud (ORG existante en base : `ORGRUN000000000B`)
- Doublon potentiel en base : aucun homologue repéré (vérification SQL live du 2026-06-26 sur `object` — recherche `%office%tourisme%`, `%bureau%information%`, `%OTI%`, `%entre-deux%`). Le seul objet « OTI du Sud » en base (`ORGRUN000000000B`) est l'**ORG institutionnelle publisher**, PAS une fiche d'accueil physique → ce BIT d'Entre-Deux est bien un nouvel objet `SPU` distinct, à rattacher à cette ORG comme publisher (pas un doublon). Action recommandée : importer comme nouvelle fiche SPU.

## Identité
- Catégorie / sous-type proposé : Office de tourisme / Bureau d'Information Touristique (point d'accueil et d'information touristique au public). C'est l'un des 4 bureaux du réseau de l'Office de Tourisme Intercommunal du Sud (OTI Sud / CASUD), implanté au cœur du village créole de l'Entre-Deux.
- Chapo : Au cœur du village créole de l'Entre-Deux, le bureau d'information touristique de l'OTI Sud accueille, renseigne et réserve pour les visiteurs : randonnées vers le Dimitile, visites guidées des cases créoles, hébergements et activités de pleine nature du Sud Sauvage.

## Description
Le Bureau d'Information Touristique de l'Entre-Deux est l'un des quatre points d'accueil du réseau de l'Office de Tourisme Intercommunal du Sud (OTI Sud), aux côtés de Bourg-Murat (Le Tampon), Manapany-les-Bains (Saint-Joseph) et le Baril (Saint-Philippe). Situé dans le centre du village créole — l'un des rares villages de La Réunion à présenter une architecture 100 % créole (cases en bois, toitures en tôle, varangues et lambrequins) — il sert de point d'information et de réservation pour de nombreux services touristiques de l'île : gîtes de randonnée, chambres et gîtes Gîtes de France, locations saisonnières Clévacances, hébergements créoles et activités de pleine nature. Le bureau propose et commercialise notamment une visite guidée des cases créoles et d'un jardin créole privé (durée environ 1h30), et fournit un plan-circuit des cases et jardins du village. C'est aussi un point de départ d'information pour les randonneurs gagnant le Dimitile, sommet culminant à plus de 1 800 m au-dessus de l'Entre-Deux. (Sources : CASUD, sudreuniontourisme.fr, reunion.fr.)

## Adresse & localisation (object_location)
- Adresse : 13, rue Fortuné Hoareau
- Code postal / ville : 97414 Entre-Deux
- GPS (WGS84) : -21.250261, 55.468961 — source : géocodage BAN (api-adresse.data.gouv.fr) de « 13 rue Fortuné Hoareau Entre-Deux », citycode=97403, label retourné « 13 Rue Fortune Hoarau 97414 Entre-Deux », type=housenumber, score 0,796. ATTENTION : score modéré (~0,80) → coordonnées à confirmer sur le terrain / par photo satellite.
- Altitude : Non trouvé — à compléter (village de l'Entre-Deux ~350–500 m ; valeur exacte du point d'accueil non confirmée par une source).

## Contacts (object_contact)
- Téléphone : 0262 39 69 80 (sources concordantes : CASUD, sudreuniontourisme.fr/annuaire-mairie/pagesjaunes)
- Email : contact@otisud.com (source : CASUD — email partagé par l'ensemble du réseau OTI Sud ; email spécifique au bureau d'Entre-Deux non distinct → à confirmer)
- Site web : https://www.sudreuniontourisme.fr (site officiel du réseau OTI Sud). Page établissement : https://www.sudreuniontourisme.fr/fiche-etablissement/entre-deux/accueil-et-information/oti-sud-bureau-d-information-touristique-de-l-entre-deux-eta_1726.html
- Réseaux sociaux : Non trouvé — à compléter (un mini-site Wix « otentre2.wixsite.com/otentre-deux » consacré à la visite du village créole a été repéré ; statut officiel / actualité à vérifier avant rattachement)

## Horaires (object_opening)
- Ouvert du lundi au samedi, de 9h00 à 12h00 et de 13h00 à 17h00 (source : CASUD + sudreuniontourisme.fr + annuaire-mairie). Fermé le dimanche.
- Saisonnalité : ouvert toute l'année (aucune fermeture saisonnière mentionnée par les sources). À confirmer pour jours fériés.

## Tarifs (object_price)
- Accueil et information : gratuit (un bureau d'information touristique).
- Prestation commercialisée — visite guidée des cases créoles + jardin créole privé (~1h30) : 10 € / adulte, 6 € / enfant, sur réservation (source : sudreuniontourisme.fr / opérateur « Johnny », via OTI). Validité du tarif : non datée par la source → à confirmer (susceptible d'évoluer).
- Autres prestations (réservations gîtes/hébergements/activités) : tarifs propres à chaque prestataire — Non trouvé — à compléter.

## Données spécifiques SPU
- Type SPU : équipement de service au public — point d'accueil et d'information touristique (office de tourisme intercommunal).
- Rattachement institutionnel : réseau OTI Sud / CASUD (Communauté d'Agglomération du Sud), 4 communes (Le Tampon, Saint-Joseph, Saint-Philippe, Entre-Deux).
- Pas de table de facette dédiée (SPU → classifications / labels génériques uniquement, cf. note facettes).
- Catégorie / classement office de tourisme (catégorie I/II/III au sens du Code du tourisme) : Non trouvé — à compléter.

## Équipements & services (object_amenity)
- Services : accueil, information touristique, documentation (plan-circuit des cases créoles), réservation d'hébergements (gîtes de randonnée, Gîtes de France, Clévacances, hôtels créoles) et d'activités de pleine nature, billetterie/réservation de la visite guidée du village (source : sudreuniontourisme.fr, reunion.fr, CASUD).
- Parking : Non trouvé — à compléter (stationnement de village à proximité probable, non confirmé).
- Sanitaires publics : Non trouvé — à compléter.
- Restauration sur place : non (bureau d'accueil) ; commerces et restaurants du village à proximité.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter.
- Langues : Français, Anglais (source : annuaire-mairie.fr). Autres langues : Non trouvé — à compléter.
- Accessibilité PMR : Non trouvé — à compléter (aucune mention « Tourisme & Handicap » repérée).

## Labels & classements (object_classification)
- Aucun label revendiqué confirmé par les sources consultées.
- À vérifier : classement « catégorie » de l'office de tourisme (Code du tourisme) ; marque/label « Qualité Tourisme » éventuel du réseau OTI Sud. NB : l'Entre-Deux n'est PAS labellisé « Les Plus Beaux Villages de France » (seul Hell-Bourg l'est à La Réunion) — ne pas mapper ce label.
- Mapping LBL_* : aucun à ce stade (Aucun trouvé).

## Médias suggérés
- Photos officielles disponibles sur la fiche établissement sudreuniontourisme.fr et la page reunion.fr (en.reunion.fr/offers/...-en-559383/). URLs exactes des fichiers image non extraites ici.
- NE PAS télécharger ni réutiliser sans autorisation de l'OTI Sud / des ayants droit.

## Données manquantes / à vérifier
- Numéro de rue exact : divergence entre sources — 13 rue Fortuné Hoareau (CASUD, reunion.fr, pagesjaunes, sudreuniontourisme) vs 9 rue Fortuné Hoareau (annuaire-mairie.fr). Retenu : **13** (majorité des sources, dont CASUD officiel) — à confirmer sur le terrain.
- GPS à fiabiliser (score BAN ~0,80) et altitude du point d'accueil.
- Email spécifique au bureau (contact@otisud.com est l'adresse mutualisée du réseau).
- Réseaux sociaux officiels du bureau.
- Classement catégorie de l'office de tourisme + éventuel label qualité.
- Tarifs détaillés / dates de validité ; moyens de paiement.
- Accessibilité PMR, sanitaires, parking.
- URLs précises des médias officiels + autorisation de réutilisation.

## Sources
- CASUD — Les offices de tourisme — https://www.casud.re/au-quotidien/decouvrir-le-territoire/les-offices-de-tourisme — consulté le 2026-06-26 (adresse, téléphone, email, horaires, réseau des 4 bureaux)
- Offices de tourisme du Sud (OTI Sud) — Fiche établissement « OTI Sud - Bureau d'Information Touristique de l'Entre-Deux » — https://www.sudreuniontourisme.fr/fiche-etablissement/entre-deux/accueil-et-information/oti-sud-bureau-d-information-touristique-de-l-entre-deux-eta_1726.html — consulté le 2026-06-26 (services, réservations, visite guidée)
- IRT / Île de La Réunion Tourisme — Offre « OTI Sud – Bureau d'Information Touristique de l'Entre-Deux » — https://en.reunion.fr/offers/oti-sud-bureau-d-information-touristique-de-l-entre-deux-entre-deux-en-559383/ — consulté le 2026-06-26 (existence, libellé officiel de l'objet)
- Annuaire-mairie.fr — Office de tourisme Entre-Deux — https://www.annuaire-mairie.fr/office-tourisme-entre-deux.html — consulté le 2026-06-26 (téléphone, langues FR/EN, variante d'adresse « 9 rue »)
- Pages Jaunes — OTI Du Sud Entre Deux — https://www.pagesjaunes.fr/pros/60945097 — consulté le 2026-06-26 (existence, adresse, téléphone)
- BAN — api-adresse.data.gouv.fr — géocodage « 13 rue Fortuné Hoareau » citycode 97403 — consulté le 2026-06-26 (GPS -21.250261, 55.468961 ; score 0,796)
