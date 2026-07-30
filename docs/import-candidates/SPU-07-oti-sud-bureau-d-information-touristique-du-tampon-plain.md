# OTI Sud — Bureau d'Information Touristique du Tampon / Plaine des Cafres — SPU (Service public / Équipement touristique)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : OTI Sud — Bureau d'Information Touristique du Tampon / Plaine des Cafres
- status : draft
- commune : Le Tampon (INSEE 97422)
- publisher : object_org_link [publisher] → OTI du Sud
- Doublon potentiel en base : **aucun repéré (vérification SQL live du 2026-06-26)**. La requête sur `object` (motifs `office`, `bureau information`, `OTI`, `information touristique`, `accueil`, `maison du tourisme`) ne retourne que l'ORG `OTI du Sud` (`ORGRUN000000000B`, published) — qui est la **structure institutionnelle / éditrice**, PAS le point d'accueil physique. La distinction ORG (publisher) ≠ objet-établissement (BIT) est conforme à l'invariant CLAUDE.md. Action recommandée : créer ce BIT comme objet SPU et le rattacher à l'ORG `OTI du Sud` via `object_org_link [publisher]`. À vérifier humainement : si les 3 autres BIT du périmètre (Entre-Deux, Saint-Joseph/Manapany, Saint-Philippe/Le Baril) sont importés en parallèle, harmoniser le nommage.

## Identité
- Catégorie / sous-type proposé : Accueil et information touristique — Bureau d'Information Touristique (BIT) d'office de tourisme intercommunal (OTI du Sud / CASUD). Service public touristique.
- Chapo : Porte d'entrée du massif du Piton de la Fournaise, le bureau d'information touristique de Bourg-Murat (Plaine des Cafres) renseigne et oriente les visiteurs sur les randonnées, hébergements et activités de plein air des Hauts du Sud.

## Description
Le Bureau d'Information Touristique du Tampon / Plaine des Cafres est l'un des points d'accueil de l'Office de Tourisme Intercommunal du Sud (OTI du Sud), structure portée par la CASUD. Situé à Bourg-Murat, sur la RN3 « Route du Volcan », il constitue le dernier point d'information avant la montée vers le Piton de la Fournaise et le Pas de Bellecombe. L'équipe y délivre information, conseil et réservation sur l'offre touristique du territoire : randonnées et gîtes de montagne, chambres d'hôtes et gîtes labellisés Gîtes de France, locations saisonnières Clévacances, hôtels et tables créoles, et activités de pleine nature (randonnée pédestre, équitation, VTT). Le bureau dessert les secteurs du Tampon et de la Plaine des Cafres, réputés pour leurs paysages d'altitude et l'accès au volcan. (Sources : CASUD, sudreuniontourisme.fr, IRT reunion.fr.)

## Adresse & localisation (object_location)
- Adresse : 160, rue Maurice et Katia Krafft — RN3, Bourg-Murat (Plaine des Cafres)
- Code postal / ville : 97418 La Plaine des Cafres — Le Tampon (INSEE 97422)
- GPS (WGS84) : **-21.2043545, 55.5722882** (point bâtiment) — source : OpenStreetMap (objet « Office de tourisme du Tampon et de la Plaine des Cafres », tag `office=information`, géocodé via Nominatim le 2026-06-26 ; NB : OSM rattache l'entrée à la « Rue Alfred Lacroix » au coin de la rue Maurice-et-Katia-Krafft). Repère de rue (fallback BAN) : -21.200143, 55.5753 — géocodage BAN api-adresse.data.gouv.fr de « 160 rue Maurice et Katia Krafft … », `citycode=97422`, **score 0,47** (résolution rue uniquement, pas numéro). **À vérifier sur le terrain** : retenir le point OSM bâtiment, confirmer le positionnement exact de l'entrée.
- Altitude : ~1 590 m (Bourg-Murat / Plaine des Cafres, ordre de grandeur connu du secteur) — **à confirmer / Non trouvé — à compléter** (pas de valeur officielle relevée pour le bâtiment).

## Contacts (object_contact)
- Téléphone : 0262 27 40 00 (concordant CASUD + sudreuniontourisme.fr + IRT)
- Email : contact@otisud.com (email institutionnel OTI du Sud, indiqué pour ce bureau sur sudreuniontourisme.fr et CASUD). NB : d'anciens annuaires tiers mentionnent `officetourismetampon@gmail.com` — **obsolète/non officiel, à NE PAS retenir sans confirmation**.
- Site web : https://www.sudreuniontourisme.fr (portail officiel OTI du Sud ; fiche dédiée : sudreuniontourisme.fr/fiche-etablissement/le-tampon/accueil-et-information/…eta_1593.html). NB : un ancien domaine `www.tampontourisme.re` apparaît dans des annuaires tiers — **statut à vérifier (probablement obsolète)**.
- Réseaux sociaux : Non trouvé — à compléter (pas de compte propre au BIT confirmé ; l'OTI du Sud dispose de pages réseaux à l'échelle de la structure, à rattacher éventuellement à l'ORG).

## Horaires (object_opening)
- **Donnée conflictuelle entre sources — à trancher sur le terrain :**
  - Sources officielles (CASUD, sudreuniontourisme.fr) : **du lundi au vendredi, 9h–16h**.
  - Énoncé de départ de la fiche : lundi–vendredi 9h–16h/17h.
  - Annuaires tiers (non officiels) : « 7j/7 9h–17h en continu, jours fériés inclus » — **non confirmé par une source officielle, à écarter sauf validation OTI.**
- Retenue provisoire (à valider) : **lundi–vendredi 9h00–16h00**. Fermeture week-end probable. Périodes/saison : Non trouvé — à compléter.

## Tarifs (object_price)
- **Accès gratuit** : service public d'accueil et d'information touristique, entrée libre et gratuite. (Cohérent avec la nature d'un bureau d'information d'office de tourisme ; aucun tarif d'entrée.) Les prestations de réservation portent sur des offres tierces (gîtes, activités) facturées par les prestataires, non par le bureau.

## Données spécifiques SPU
- Type SPU : pas de table de facette dédiée (classifications/labels génériques). Service public touristique — équipement d'accueil et d'information de l'OTI du Sud / CASUD.
- Gestionnaire / exploitant : Office de Tourisme Intercommunal du Sud (OTI du Sud), compétence CASUD.
- Fonction : accueil, information, conseil, réservation (gîtes de montagne, Gîtes de France, Clévacances, hôtellerie créole, activités de pleine nature).
- Point d'intérêt territorial : dernier point d'information avant l'accès au Piton de la Fournaise (Route du Volcan / RN3) ; voisin de la Cité du Volcan (rond-point cité).

## Équipements & services (object_amenity)
- Parking : Non trouvé — à compléter (stationnement probable à proximité sur la RN3 / zone Bourg-Murat, non confirmé).
- Sanitaires : Non trouvé — à compléter.
- Accès / situation : en bordure de RN3, à Bourg-Murat, après le rond-point de la Cité du Volcan et la station-service (en venant de l'Est).
- Restauration : non — service d'accueil uniquement.
- Service de réservation (hébergements / activités) : oui (point information + réservation).
- Documentation touristique / brochures, conseil de séjour : oui.
- Wifi / espace numérique : Non trouvé — à compléter.

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (service d'accueil gratuit ; modalités pour d'éventuelles réservations non précisées).
- Langues : français confirmé ; le portail OTI propose des versions anglais/allemand (couverture linguistique de la structure). Langues parlées au guichet : **à confirmer** (anglais probable). Non trouvé — à compléter pour le détail.
- Accessibilité PMR : Non trouvé — à compléter (aucune mention d'accessibilité fauteuil relevée sur les sources officielles).

## Labels & classements (object_classification)
- Aucun label revendiqué trouvé sur les sources consultées pour ce bureau (pas de marque « Qualité Tourisme » ni classement d'office mentionné). → Aucun trouvé.
- À vérifier : éventuel classement de l'office de tourisme (catégorie I/II/III) ou marque qualité au niveau de l'OTI du Sud — Non trouvé — à compléter.

## Médias suggérés
- Photos officielles disponibles sur la fiche sudreuniontourisme.fr (eta_1593) et la fiche IRT reunion.fr (établissement 1593). **NE PAS télécharger sans autorisation** (droits OTI du Sud / IRT). URLs directes des médias non extraites (pages protégées / paywall annuaires). À récupérer auprès de l'OTI du Sud lors de la complétion.

## Données manquantes / à vérifier
- Horaires exacts (conflit lun–ven 9h–16h officiel vs « 7j/7 9h–17h » annuaires) → trancher avec l'OTI.
- GPS précis de l'entrée (point OSM bâtiment retenu, à confirmer ; BAN score 0,47 rue seulement).
- Altitude exacte du bâtiment.
- Email/site web canoniques (écarter `officetourismetampon@gmail.com` et `tampontourisme.re` si obsolètes).
- Réseaux sociaux propres au bureau (sinon rattacher à l'ORG).
- Équipements sur place : parking, sanitaires, wifi, accessibilité PMR.
- Langues parlées au guichet (anglais/allemand ?).
- Labels / classement de l'office.
- Médias officiels (URLs + autorisation de réutilisation).

## Sources
- CASUD — Les offices de tourisme — https://www.casud.re/au-quotidien/decouvrir-le-territoire/les-offices-de-tourisme — consulté le 2026-06-26 (adresse, tél. 0262 27 40 00, email contact@otisud.com, horaires lun–ven 9h–16h).
- Offices de tourisme du Sud (OTI du Sud) — fiche établissement eta_1593 — https://www.sudreuniontourisme.fr/fiche-etablissement/le-tampon/accueil-et-information/oti-sud-bureau-d-information-touristique-du-tampon-plaine-des-cafres-eta_1593.html — consulté le 2026-06-26.
- Offices de tourisme du Sud — page office « Le Tampon, Porte du Volcan » — https://www.sudreuniontourisme.fr/offices/le-tampon.html — consulté le 2026-06-26 (adresse, services, horaires lun–ven 9h–16h).
- Île de La Réunion Tourisme (IRT) — OTI Sud Bureau d'Information Touristique du Tampon/Plaine des Cafres — https://en.reunion.fr/offers/oti-sud-bureau-d-information-touristique-du-tampon-plaine-des-cafres-la-plaine-des-cafres-le-tampon-en-558160/ — consulté le 2026-06-26 (confirmation existence, dénomination officielle).
- OpenStreetMap / Nominatim — « Office de tourisme du Tampon et de la Plaine des Cafres », office=information — geocoding -21.2043545 / 55.5722882 — consulté le 2026-06-26.
- BAN api-adresse.data.gouv.fr — géocodage « 160 rue Maurice et Katia Krafft … » citycode 97422, score 0,47 (rue) — consulté le 2026-06-26.
