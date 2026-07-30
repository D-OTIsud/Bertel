# OTI Sud — Bureau d'Information Touristique de Saint-Joseph (Maison du Tourisme du Sud Sauvage) — SPU (Service public)

> Fiche candidate à l'import — recherche web du 2026-06-26. Statut : À RÉVISER (non vérifié sur le terrain).

## Proposition d'import
- object_type : SPU
- name : OTI Sud — Bureau d'Information Touristique de Saint-Joseph (Maison du Tourisme du Sud Sauvage)
- status : draft
- commune : Saint-Joseph (INSEE 97412)
- publisher : object_org_link [publisher] → OTI du Sud
- Sous-catégorie (taxonomy_spu) : accueil_information_touristique (bureau / point d'accueil d'office de tourisme)
- Doublon potentiel en base : **aucun établissement repéré** — vérification SQL live du 2026-06-26 (`SELECT id, name, object_type, status FROM object WHERE lower(name) LIKE lower('%office%tourisme%') OR lower(name) LIKE lower('%bureau%information%') OR lower(name) LIKE lower('%maison du tourisme%') OR lower(name) LIKE lower('%oti%') OR lower(name) LIKE lower('%four a chaux%') OR lower(name) LIKE lower('%manapany%') OR lower(name) LIKE lower('%sud sauvage%')` → aucun point d'accueil ; les lignes Manapany/Sud Sauvage retournées sont des HLO/RES/ACT sans rapport. Contrôle complémentaire `object_type='SPU' OR name LIKE '%accueil%' OR '%maison du tourisme%'` → seul un SPU « Médiathèque » sans rapport). **« OTI du Sud » existe en base mais en tant qu'`ORG` (status `published`)** : c'est la structure institutionnelle / publisher, PAS le bureau d'accueil physique de Manapany. Les deux ne sont PAS des doublons : l'ORG porte les publications, le présent objet SPU est le point d'accueil visitable. **Action recommandée** : importer ce SPU et le **rattacher** à l'ORG « OTI du Sud » via `object_org_link [publisher]` (l'ORG est aussi le gestionnaire). Ne PAS fusionner avec l'ORG.

## Identité
- Catégorie / sous-type proposé : Service public — accueil et information touristique (bureau d'office de tourisme intercommunal OTI du Sud / CASUD)
- Chapo : Le point d'accueil de l'OTI du Sud à Saint-Joseph, installé dans la « Maison du Tourisme du Sud Sauvage » à Manapany-les-Bains, en bord de mer : conseils de séjour, réservation d'hébergements et d'activités, et vitrine d'artisanat et de produits locaux.

## Description
Le Bureau d'Information Touristique de Saint-Joseph est l'antenne locale de l'Office de Tourisme Intercommunal (OTI) du Sud, structure intercommunale rattachée à la CASUD qui couvre le territoire du Sud sauvage. Il occupe la « Maison du Tourisme du Sud Sauvage », un bâtiment situé au lieu-dit « Au Four à Chaux » à Manapany-les-Bains, dans un cadre balnéaire en surplomb de la baie. Le bureau fonctionne comme un point d'accueil, d'information et de réservation portant sur l'ensemble des services touristiques de l'île : gîtes de randonnée, hébergements labellisés Gîtes de France, locations saisonnières (Clévacances), hôtellerie créole et activités de pleine nature (randonnée, équitation, parapente, VTT) ainsi que les visites du patrimoine. Deux circuits y sont mis en avant : les « Villages créoles » et la « Route des artisans ». Selon les avis de visiteurs publiés en ligne (TripAdvisor), on y trouve également une sélection d'artisanat et de produits locaux, et l'accueil y est régulièrement décrit comme chaleureux, le personnel parlant un anglais de base. L'objet est une commodité d'orientation utile pour les visiteurs en transit dans le Sud sauvage (RN2, front de mer de Manapany).

## Adresse & localisation (object_location)
- Adresse : 15, allée du Four à Chaux — Manapany-les-Bains (lieu-dit « Au Four à Chaux ») — source : OTI du Sud (sudreuniontourisme.fr), reunion.fr (IRT), Petit Futé
- Code postal / ville : 97480 Saint-Joseph (Manapany-les-Bains) — NB : 97480 = code postal ; le code **INSEE** de la commune est **97412** (à utiliser pour le périmètre / `taxonomy`)
- GPS (WGS84) : -21.375632, 55.590257 — source : géocodage BAN api-adresse.data.gouv.fr de « 15 allée du Four à Chaux » (citycode 97412 confirmé, type `housenumber`, **score 0,50** — à fiabiliser sur le terrain, le score modéré reflète un appariement de voie partiel ; commune Saint-Joseph 97412 confirmée)
- Altitude : Non trouvé — à compléter (site balnéaire en bord de baie ; altitude proche du niveau de la mer mais non sourcée précisément)

## Contacts (object_contact)
- Téléphone : 0262 37 37 11 (tarif appel local) — source : OTI du Sud (sudreuniontourisme.fr), reunion.fr
- Email : contact@otisud.com — source : page office sudreuniontourisme.fr (email générique de l'OTI du Sud — à confirmer comme adresse de contact du bureau de Saint-Joseph spécifiquement)
- Site web : https://www.sudreuniontourisme.fr (OTI du Sud) ; page office : https://www.sudreuniontourisme.fr/offices/saint-joseph-sud-sauvage.html — source : OTI du Sud
- Réseaux sociaux (de l'OTI du Sud, pas spécifiques au bureau) : Facebook https://www.facebook.com/Otisud (+ page Destination.Sud.Reunion.974) ; Instagram @destinationsudreunion ; YouTube chaîne « otisud » — source : sudreuniontourisme.fr

## Horaires (object_opening)
- Lundi à samedi : 9 h 00 – 12 h 00 et 13 h 00 – 17 h 00 (fermé entre 12 h et 13 h)
- Dimanche : Non trouvé — à compléter (fermeture probable mais non confirmée par une source ; un annuaire mentionne « ouvert le dimanche » sans détail → à vérifier)
- source : OTI du Sud (sudreuniontourisme.fr), reunion.fr, TripAdvisor

## Tarifs (object_price)
Gratuit — l'accueil et l'information d'un bureau d'office de tourisme sont un service public gratuit. (La réservation d'hébergements/activités peut donner lieu à facturation par les prestataires, mais l'accès au bureau et le conseil sont gratuits.) Vente possible de produits artisanaux/locaux sur place (tarifs non documentés). À confirmer.

## Données spécifiques SPU
- Sous-catégorie (taxonomy_spu) : accueil et information touristique (bureau / antenne d'office de tourisme) — à mapper sur le code SPU adéquat lors de l'import (le périmètre SPU a été élargi en §57 ; vérifier le code taxonomique « accueil / information touristique »)
- Type d'équipement : point d'accueil d'office de tourisme intercommunal (OTI du Sud / CASUD)
- Gestionnaire / exploitant : OTI du Sud (Office de Tourisme Intercommunal du Sud, association loi 1901 — SIREN 882 699 556, rattachée à la CASUD) — source : net1901.org, CASUD
- Services rendus : information touristique, conseil de séjour, réservation (gîtes de randonnée, Gîtes de France, Clévacances, hôtellerie créole, activités de pleine nature), promotion des circuits « Villages créoles » et « Route des artisans », vente d'artisanat et de produits locaux
- Accès : public, gratuit ; amplitude horaire = horaires d'ouverture du bureau (voir Horaires)

## Équipements & services (object_amenity)
- Accueil physique avec conseillers en séjour — confirmé (sources OTI / avis)
- Documentation touristique, brochures — confirmé (OTI propose des brochures téléchargeables et en accueil)
- Espace boutique / artisanat et produits locaux — mentionné par les avis visiteurs (TripAdvisor) — à confirmer
- Parking : Non trouvé — à compléter
- Sanitaires : Non trouvé — à compléter
- Wi-Fi / point d'eau : Non trouvé — à compléter

## Paiement / langues / accessibilité
- Moyens de paiement : Non trouvé — à compléter (pertinent uniquement pour l'éventuelle vente de produits ; le conseil est gratuit)
- Langues : Français ; Anglais (« good basic English » selon des avis de visiteurs internationaux). Le portail de l'OTI existe aussi en versions anglaise et allemande, mais cela ne préjuge pas des langues parlées à l'accueil du bureau. À confirmer.
- Accessibilité PMR : Non trouvé — à compléter. L'OTI du Sud annonce des visites/circuits adaptés aux personnes à mobilité réduite, mais l'accessibilité du **bâtiment de Manapany** n'est pas documentée (un avis évoque escaliers et accès « pas facile à trouver » dans un site en pente — accessibilité du bureau à vérifier sur le terrain).

## Labels & classements (object_classification)
- L'OTI du Sud met en avant une démarche « Qualité Tourisme » via l'initiative « Le Sud s'engage » au niveau de la structure — source : sudreuniontourisme.fr. **Attribution du label « Qualité Tourisme » au bureau de Saint-Joseph spécifiquement : non confirmée** → à vérifier avant de mapper `LBL_QUALITE_TOURISME`.
- Label « Tourisme & Handicap » (`LBL_TOURISME_HANDICAP`) : Aucun trouvé pour ce bureau — à vérifier.
- Aucun autre label/classement trouvé.

## Médias suggérés
- Photos officielles du lieu sur la page office OTI : https://www.sudreuniontourisme.fr/offices/saint-joseph-sud-sauvage.html
- Galerie de photos du lieu (extérieur « Au Four à Chaux », baie de Manapany, locaux) sur TripAdvisor : https://www.tripadvisor.fr/Attraction_Review-g635742-d7740279-Reviews-Maison_du_Tourisme_Sud_Sauvage-Saint_Joseph_Arrondissement_of_Saint_Pierre.html
- NE PAS télécharger ces images sans autorisation des ayants droit (OTI du Sud / contributeurs TripAdvisor). Privilégier une photo fournie par l'OTI.

## Données manquantes / à vérifier
- Score de géocodage modéré (0,50) : confirmer la position exacte du bâtiment (relevé GPS terrain) — l'adresse « allée du Four à Chaux » n'a pas matché au numéro exact avec une confiance forte.
- Altitude du site.
- Ouverture le dimanche (contradiction entre annuaires et horaires officiels lun.–sam.).
- Email de contact propre au bureau de Saint-Joseph (vs email générique OTI).
- Accessibilité PMR du bâtiment de Manapany (escaliers évoqués), label Tourisme & Handicap.
- Attribution effective du label « Qualité Tourisme » à ce bureau d'accueil.
- Présence et tarifs de la boutique d'artisanat/produits locaux (mentionnée par des avis, à confirmer côté OTI).
- Parking, sanitaires, Wi-Fi sur place.
- Photo officielle libre de droits.
- Note de cohérence métier : SPU = pas de table facette type-spécifique ; classifications/labels génériques uniquement (cf. note facettes du gabarit).

## Sources
- OTI du Sud — Saint-Joseph, le Sud Sauvage (adresse 15 allée du Four à Chaux, tél. 0262 37 37 11, email contact@otisud.com, horaires lun.–sam. 9h–12h / 13h–17h, services) — sudreuniontourisme.fr — https://www.sudreuniontourisme.fr/offices/saint-joseph-sud-sauvage.html — consulté le 2026-06-26
- OTI du Sud — fiche établissement « OTI Sud – Bureau d'Information Touristique de Saint-Joseph » — sudreuniontourisme.fr — https://www.sudreuniontourisme.fr/fiche-etablissement/saint-joseph/accueil-et-information/oti-sud-bureau-d-information-touristique-de-saint-joseph-eta_1722.html — consulté le 2026-06-26
- Île de la Réunion Tourisme (IRT) — « OTI Sud – Bureau d'Information Touristique de Saint-Joseph » (nom officiel, localisation Saint-Joseph) — reunion.fr — https://en.reunion.fr/offers/oti-sud-bureau-d-information-touristique-de-saint-joseph-saint-joseph-en-557998/ — consulté le 2026-06-26
- Maison du Tourisme Sud Sauvage — avis et photos (existence physique, accueil chaleureux, artisanat/produits locaux, cadre « Au Four à Chaux » Manapany, horaires) — TripAdvisor — https://www.tripadvisor.fr/Attraction_Review-g635742-d7740279-Reviews-Maison_du_Tourisme_Sud_Sauvage-Saint_Joseph_Arrondissement_of_Saint_Pierre.html — consulté le 2026-06-26
- CASUD — Les offices de tourisme (rattachement OTI du Sud à la CASUD, périmètre) — casud.re — https://www.casud.re/au-quotidien/decouvrir-le-territoire/les-offices-de-tourisme — consulté le 2026-06-26
- Office de tourisme de Saint-Joseph / Manapany — Fédération Réunionnaise du Tourisme — frt.re — https://frt.re/lieu/office-de-tourisme-de-manapany/ — consulté le 2026-06-26
- OTI DU SUD — Saint-Joseph (association loi 1901, SIREN 882 699 556, gestionnaire) — net1901.org — https://www.net1901.org/entreprise/OTI-DU-SUD,88269955600065.html — consulté le 2026-06-26
- Office de tourisme de Saint-Joseph (Manapany) — Petit Futé — https://www.petitfute.co.uk/v41130-manapany-97480/c1173-visites-points-d-interet/c1213-office-de-tourisme/81328-office-de-tourisme-de-saint-joseph.html — consulté le 2026-06-26
- Base Adresse Nationale, géocodage de « 15 allée du Four à Chaux » (citycode 97412, type housenumber, score 0,50, lon 55.590257 / lat -21.375632) — api-adresse.data.gouv.fr — https://api-adresse.data.gouv.fr/search/?q=15%20allee%20du%20Four%20a%20Chaux%20Manapany%20les%20Bains&citycode=97412 — consulté le 2026-06-26
- Vérification doublon en base live (object) — Supabase MCP, le 2026-06-26 (1 ligne « OTI du Sud » = ORG publisher, aucun établissement/bureau d'accueil)
